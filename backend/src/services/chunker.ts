export interface ChunkOptions {
  maxTokens?: number;
  overlapTokens?: number;
}

export interface TextChunk {
  text: string;
  tokenCount: number;
  chunkIndex: number;
}

const DEFAULT_MAX_TOKENS = 800;
const DEFAULT_OVERLAP_TOKENS = 100;

export function countTokens(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function chunkText(
  text: string,
  options: ChunkOptions = {}
): TextChunk[] {
  const maxTokens = options.maxTokens || DEFAULT_MAX_TOKENS;
  const overlapTokens = options.overlapTokens || DEFAULT_OVERLAP_TOKENS;

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

  return chunks;
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
  return parts;
}

function getOverlapText(text: string, overlapTokens: number): string {
  const words = text.split(/\s+/);
  if (words.length <= overlapTokens) return text;
  return words.slice(-overlapTokens).join(' ');
}

export function validateChunkSize(text: string, maxTokens = DEFAULT_MAX_TOKENS): boolean {
  return countTokens(text) <= maxTokens;
}