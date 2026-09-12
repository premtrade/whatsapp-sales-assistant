import { config } from '../config';
import logger from '../utils/logger';

const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIMENSION = 768;

function getGeminiApiKey(): string {
  const apiKey = config.gemini.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }
  return apiKey;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const apiKey = getGeminiApiKey();
    const body = JSON.stringify({
      content: { parts: [{ text }] },
      outputDimensionality: EMBEDDING_DIMENSION,
    });

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gemini embed failed: ${response.status} ${response.statusText} ${text}`);
    }

    const result = (await response.json()) as { embedding?: { values: number[] } };
    const embedding = result.embedding?.values;

    if (!embedding || embedding.length === 0) {
      throw new Error('Empty embedding returned');
    }

    if (embedding.length !== EMBEDDING_DIMENSION) {
      logger.warn('Unexpected embedding dimension', {
        expected: EMBEDDING_DIMENSION,
        actual: embedding.length,
      });
    }

    return embedding;
  } catch (error) {
    logger.error('Failed to generate embedding', { error });
    throw new Error(`Embedding generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = [];

  for (const text of texts) {
    const embedding = await generateEmbedding(text);
    embeddings.push(embedding);
  }

  return embeddings;
}

export function formatEmbeddingForPgVector(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

export function parsePgVectorEmbedding(vectorStr: string): number[] {
  const cleaned = vectorStr.replace(/[\[\]]/g, '');
  return cleaned.split(',').map(v => parseFloat(v.trim()));
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const av = a[i];
    const bv = b[i];
    if (av === undefined || bv === undefined) continue;
    dotProduct += av * bv;
    normA += av * av;
    normB += bv * bv;
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
