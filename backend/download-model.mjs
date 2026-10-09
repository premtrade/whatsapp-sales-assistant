/**
 * Pre-downloads the local embedding model into the transformers.js cache so the
 * production image can generate embeddings OFFLINE (no HuggingFace access is
 * needed at runtime). Run once during `docker build`.
 *
 * Must match EMBEDDING_MODEL in src/services/embedding.ts.
 */
import { pipeline, env } from '@xenova/transformers';

const model = process.env.EMBEDDING_MODEL_NAME || 'Xenova/all-mpnet-base-v2';
env.cacheDir = process.env.TRANSFORMERS_CACHE || './.cache';
env.allowRemoteModels = true;
env.allowLocalModels = true;

console.log(`Downloading embedding model "${model}" into ${env.cacheDir} ...`);
const extractor = await pipeline('feature-extraction', model);
// Run a real inference so every model artifact (onnx weights, tokenizer) is
// materialized in the cache before the build finishes.
await extractor('warmup sentence.');
console.log('Embedding model cached successfully.');
