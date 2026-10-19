import { EMBEDDING_MAX_TOKENS } from './embedding';

export interface ChunkOptions {
  maxTokens?: number;
  overlapTokens?: number;
}

export interface TextChunk {
  text: string;
  tokenCount: number;
  chunkIndex: number;
  section: string | null;
}

// all-mpnet-base-v2 (the active embedder, see services/embedding.ts) truncates
// past 384 tokens, so every chunk must fit inside that window or the embedding
// silently covers only the first ~60% of the text and retrieval for the tail
// degrades. The default is set to leave headroom for the overlap prefix.
const DEFAULT_MAX_TOKENS = 384;
const DEFAULT_OVERLAP_TOKENS = 64;

// countTokens() counts whitespace words, but the embedder tokenizes SUBWORDS:
// one English word averages ~1.3 subword tokens. Sizing chunks on the raw word
// count produced "384-token" chunks that were actually 500+ model tokens and
// got silently truncated. Estimate conservatively instead.
const SUBWORD_EXPANSION = 1.3;
// Leave headroom so the estimate stays safely under the hard ceiling.
const SIZE_BUDGET = 320;

export function countTokens(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function estimateModelTokens(text: string): number {
  return Math.ceil(countTokens(text) * SUBWORD_EXPANSION);
}

interface Section {
  title: string | null;
  body: string;
}

// Split on `=== SECTION ===` dividers and markdown headings BEFORE sentence
// splitting. The old pipeline flattened all newlines and split on [.!?], which
// guaranteed service tables (e.g. "5.1 AI Customer Assistant - ...") were
// chopped mid-row across chunks — a table is only useful to retrieval if the
// question and the answer it needs live in the SAME chunk.
function splitIntoSections(text: string): Section[] {
  const lines = text.split('\n');
  const sections: Section[] = [];
  let currentTitle: string | null = null;
  let buffer: string[] = [];
  let sawAnyDivider = false;

  const flush = () => {
    const body = buffer.join('\n').trim();
    if (body.length > 0) sections.push({ title: currentTitle, body });
    buffer = [];
  };

  for (const line of lines) {
    const equals = line.match(/^={3,}\s*(.+?)\s*={3,}\s*$/);
    const heading = line.match(/^#{1,4}\s+(.+?)\s*$/);
    const divider = equals || heading;
    if (divider && divider[1] && divider[1].length <= 120) {
      sawAnyDivider = true;
      flush();
      currentTitle = divider[1];
    } else {
      buffer.push(line);
    }
  }
  flush();

  // No structural dividers at all -> one anonymous section, sentence-split as
  // before. (A doc with a single divider is still structurally split.)
  if (!sawAnyDivider) return [{ title: null, body: text }];
  return sections;
}

export function chunkText(
  text: string,
  options: ChunkOptions = {}
): TextChunk[] {
  // Never hand the embedder more than it can consume, regardless of what the
  // caller requests. The overlap prefix is counted, so this also bounds the
  // overlap-augmented chunks below.
  const maxTokens = Math.min(options.maxTokens || DEFAULT_MAX_TOKENS, EMBEDDING_MAX_TOKENS);
  const overlapTokens = Math.min(options.overlapTokens || DEFAULT_OVERLAP_TOKENS, EMBEDDING_MAX_TOKENS);
  // Size against the conservative subword estimate, not the raw word count.
  const sizeBudget = Math.min(SIZE_BUDGET, maxTokens);

  const chunks: TextChunk[] = [];
  let chunkIndex = 0;

  for (const section of splitIntoSections(text)) {
    // Prefix every chunk with its section title so the EMBEDDING carries the
    // context. Without it, a chunk containing only "5.2 CRM Integration - ..."
    // has no signal that it belongs to Services, and "what services do you
    // offer" matches it weakly.
    const titlePrefix = section.title ? `[${section.title}] ` : '';

    const sentences = splitIntoSentences(section.body);
    let currentChunk = '';
    let currentTokenCount = 0;

    const pushChunk = (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;
      const finalText = titlePrefix + trimmed;
      chunks.push({
        text: finalText,
        tokenCount: estimateModelTokens(finalText),
        chunkIndex: chunkIndex++,
        section: section.title,
      });
    };

    for (const sentence of sentences) {
      const sentenceTokens = estimateModelTokens(sentence);

      if (sentenceTokens > sizeBudget) {
        if (currentChunk) {
          pushChunk(currentChunk);
          currentChunk = '';
          currentTokenCount = 0;
        }
        for (const lc of splitLongSentence(sentence, sizeBudget)) {
          pushChunk(lc);
        }
        continue;
      }

      if (currentTokenCount + sentenceTokens > sizeBudget && currentChunk) {
        pushChunk(currentChunk);
        const overlapText = getOverlapText(currentChunk, overlapTokens);
        currentChunk = overlapText + ' ' + sentence;
        currentTokenCount = estimateModelTokens(currentChunk);
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
        currentTokenCount += sentenceTokens;
      }
    }

    if (currentChunk.trim()) {
      pushChunk(currentChunk);
    }
  }

  // Final safety net: the overlap prefix can in rare cases push a chunk a few
  // tokens over the limit. Split anything still over the ceiling so the
  // invariant "no chunk exceeds EMBEDDING_MAX_TOKENS" holds by construction.
  return chunks
    .flatMap((chunk) => {
      if (chunk.tokenCount <= EMBEDDING_MAX_TOKENS) return [chunk];
      return splitLongSentence(chunk.text, EMBEDDING_MAX_TOKENS).map((lc) => ({
        text: lc,
        tokenCount: estimateModelTokens(lc),
        chunkIndex: chunkIndex++,
        section: chunk.section,
      }));
    })
    .filter((chunk) => chunk.text.length > 0);
}

function splitIntoSentences(text: string): string[] {
  return text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function splitLongSentence(sentence: string, maxTokens: number): string[] {
  const words = sentence.split(/\s+/);
  const parts: string[] = [];
  let current = '';

  for (const word of words) {
    // Split on the same conservative subword estimate used for sizing.
    if (estimateModelTokens(current + ' ' + word) > maxTokens && current) {
      parts.push(current.trim());
      current = word;
    } else {
      current += (current ? ' ' : '') + word;
    }
  }
  if (current) parts.push(current.trim());
  return parts.filter((p) => p.length > 0);
}

function getOverlapText(text: string, overlapTokens: number): string {
  const words = text.split(/\s+/);
  if (words.length <= overlapTokens) return text;
  return words.slice(-overlapTokens).join(' ');
}

export function validateChunkSize(text: string, maxTokens = DEFAULT_MAX_TOKENS): boolean {
  return estimateModelTokens(text) <= Math.min(maxTokens, EMBEDDING_MAX_TOKENS);
}