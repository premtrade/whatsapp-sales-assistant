import { pipeline, env } from '@xenova/transformers';
import logger from '../utils/logger';

/**
 * Local ONNX embedding model.
 *
 * We previously used Google Gemini (`gemini-embedding-001`), but that key's GCP
 * project has the entire Generative Language API blocked (403
 * API_KEY_SERVICE_BLOCKED), the OpenAI fallback key is a 401, and the HF
 * endpoints are dead — so every upload failed at the embedding step.
 *
 * `Xenova/all-mpnet-base-v2` runs in-process (ONNX Runtime, no network, no API
 * key) and emits exactly 768 dimensions, matching the `vector(768)` column.
 *
 * IMPORTANT: indexing AND query/search both import from this file, so switching
 * the implementation here switches both to the same embedder — which is required
 * for cosine similarity to be meaningful.
 */
export const EMBEDDING_MODEL = 'Xenova/all-mpnet-base-v2';
const EMBEDDING_DIMENSION = 768;

// Longest text we send to the model. all-mpnet-base-v2 has a 384-token limit and
// transformers.js truncates past it; slicing first avoids pointless work/warnings.
const MAX_INPUT_CHARS = 8000;

type Extractor = (text: string, options: { pooling: 'mean'; normalize: boolean }) => Promise<{ data: ArrayLike<number> }>;

let extractorPromise: Promise<Extractor> | null = null;

function getExtractor(): Promise<Extractor> {
  if (!extractorPromise) {
    // Point at the pre-baked model cache baked into the image (see Dockerfile /
    // download-model.mjs). In production the model is already on disk, so we must
    // NOT try to reach the network — HuggingFace is unreachable at runtime.
    const cacheDir = process.env.TRANSFORMERS_CACHE || env.cacheDir;
    if (cacheDir) {
      env.cacheDir = cacheDir;
    }
    env.allowLocalModels = true;
    // Allow a remote download only when explicitly enabled or in non-production
    // (local dev downloads the model once). In production we rely on the cache.
    env.allowRemoteModels =
      process.env.EMBEDDING_ALLOW_REMOTE_MODELS === 'true' || process.env.NODE_ENV !== 'production';

    extractorPromise = (pipeline('feature-extraction', EMBEDDING_MODEL) as unknown) as Promise<Extractor>;
  }
  return extractorPromise;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const extractor = await getExtractor();
    const safeText = typeof text === 'string' && text.trim().length > 0 ? text.slice(0, MAX_INPUT_CHARS) : 'empty';
    const output = await extractor(safeText, { pooling: 'mean', normalize: true });
    const embedding = Array.prototype.slice.call(output.data) as number[];

    if (embedding.length !== EMBEDDING_DIMENSION) {
      throw new Error(
        `Unexpected embedding dimension: ${embedding.length} (expected ${EMBEDDING_DIMENSION})`
      );
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
