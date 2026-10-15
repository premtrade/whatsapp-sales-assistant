import { EMBEDDING_MAX_TOKENS } from './embedding';

export interface ChunkOptions {
  maxTokens?: number;
  overlapTokens?: number;
}

export interface TextChunk {
  text: string;
  tokenCount: number;
  chunkIndex: number;
}

// all-mpnet-base-v2 (the active embedder, see services/embedding.ts) truncates
// past 384 tokens, so every chunk must fit inside that window or the embedding
// silently covers only the first ~60% of the text and retrieval for the tail
// degrades. The default is set to leave headroom for the overlap prefix.
const DEFAULT_MAX_TOKENS = 384;
const DEFAULT_OVERLAP_TOKENS = 64;

export function countTokens(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
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

  const sentences = splitIntoSentences(text);
  const chunks: TextChunk[] = [];
  let currentChunk = '';
  let currentTokenCount = 0;
  let chunkIndex = 0;

  for (const sentence of sentences) {
    const sentenceTokens = countTokens(sentence);

    if (sentenceTokens > maxTokens) {
      if (currentChunk) {
        chunks.push({
          text: currentChunk.trim(),
          tokenCount: currentTokenCount,
          chunkIndex: chunkIndex++,
        });
        currentChunk = '';
        currentTokenCount = 0;
      }
      const longChunks = splitLongSentence(sentence, maxTokens);
      for (const lc of longChunks) {
        chunks.push({
          text: lc,
          tokenCount: countTokens(lc),
          chunkIndex: chunkIndex++,
        });
      }
      continue;
    }

    if (currentTokenCount + sentenceTokens > maxTokens && currentChunk) {
      chunks.push({
        text: currentChunk.trim(),
        tokenCount: currentTokenCount,
        chunkIndex: chunkIndex++,
      });

      const overlapText = getOverlapText(currentChunk, overlapTokens);
      currentChunk = overlapText + ' ' + sentence;
      currentTokenCount = countTokens(currentChunk);
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
      currentTokenCount += sentenceTokens;
    }
  }

  if (currentChunk.trim()) {
    chunks.push({
      text: currentChunk.trim(),
      tokenCount: currentTokenCount,
      chunkIndex: chunkIndex,
    });
  }

  // Final safety net: the overlap prefix can in rare cases push a chunk a few
  // tokens over the limit. Split anything still over the ceiling so the
  // invariant "no chunk exceeds EMBEDDING_MAX_TOKENS" holds by construction.
  return chunks
    .flatMap((chunk) => {
      if (chunk.tokenCount <= EMBEDDING_MAX_TOKENS) return [chunk];
      return splitLongSentence(chunk.text, EMBEDDING_MAX_TOKENS).map((lc, i) => ({
        text: lc,
        tokenCount: countTokens(lc),
        chunkIndex: chunkIndex++,
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
  let currentCount = 0;

  for (const word of words) {
    if (currentCount + 1 > maxTokens && current) {
      parts.push(current.trim());
      current = word;
      currentCount = 1;
    } else {
      current += (current ? ' ' : '') + word;
      currentCount++;
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
  return countTokens(text) <= Math.min(maxTokens, EMBEDDING_MAX_TOKENS);
}