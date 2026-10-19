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

/**
 * Maximum tokens the active embedder accepts. all-mpnet-base-v2 truncates
 * past 384 tokens, so the chunker must keep every chunk under this ceiling —
 * otherwise the embedding silently covers only the first ~60% of the text and
 * retrieval for the tail of a chunk degrades.
 */
export const EMBEDDING_MAX_TOKENS = 384;

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
  // transformers.js accepts an array input and encodes it in ONE forward pass
  // per batch — up to ~5x faster than one-by-one for document uploads. Batches
  // are kept small (8) so peak memory stays friendly on the 4GB Droplet.
  const BATCH_SIZE = 8;
  const embeddings: number[][] = [];

  if (texts.length === 0) return embeddings;

  const extractor = await getExtractor();

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE).map((t) =>
      typeof t === 'string' && t.trim().length > 0 ? t.slice(0, MAX_INPUT_CHARS) : 'empty'
    );
    // transformers.js v2 feature-extraction returns ONE tensor with dims
    // [batch, 768] for array input (data length = batch × 768) — NOT an array of
    // per-item tensors. Parsing it correctly is what splitBatchOutput does.
    const batched = extractor as unknown as (input: string[], opts: object) => Promise<unknown>;
    const outputs = await batched(batch, { pooling: 'mean', normalize: true });

    const rows = splitBatchOutput(outputs, batch.length);
    for (const embedding of rows) {
      if (embedding.length !== EMBEDDING_DIMENSION) {
        throw new Error(
          `Unexpected embedding dimension: ${embedding.length} (expected ${EMBEDDING_DIMENSION})`
        );
      }
      embeddings.push(embedding);
    }
  }

  return embeddings;
}

// Split the model output into one 768-dim embedding per input text.
//
// transformers.js v2 returns a single flat tensor of shape [batch, hidden]
// (e.g. data.length === 6144 for a batch of 8). The previous code did
// `Array.isArray(outputs) ? outputs : [outputs]` and then measured the WHOLE
// flat tensor as one embedding — so any upload with more than one chunk died
// with "Unexpected embedding dimension: 6144 (expected 768)" (500 on upload).
// Handles both the real tensor shape and a hypothetical per-item array.
function splitBatchOutput(outputs: unknown, batchSize: number): number[][] {
  if (Array.isArray(outputs)) {
    return outputs.map((o) => Array.prototype.slice.call((o as { data: ArrayLike<number> }).data) as number[]);
  }

  const data = (outputs as { data?: ArrayLike<number> }).data;
  if (!data || data.length === 0) {
    return [];
  }

  // Batch of a single text can come back as a plain [768] vector.
  if (data.length === EMBEDDING_DIMENSION) {
    return [Array.prototype.slice.call(data) as number[]];
  }

  if (data.length % EMBEDDING_DIMENSION !== 0) {
    throw new Error(
      `Unexpected embedding data length: ${data.length} (not a multiple of ${EMBEDDING_DIMENSION})`
    );
  }

  const rows: number[][] = [];
  for (let start = 0; start < data.length; start += EMBEDDING_DIMENSION) {
    rows.push(
      Array.prototype.slice.call(data, start, start + EMBEDDING_DIMENSION) as number[]
    );
  }

  if (rows.length !== batchSize) {
    throw new Error(
      `Unexpected embedding batch size: ${rows.length} (expected ${batchSize})`
    );
  }
  return rows;
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
