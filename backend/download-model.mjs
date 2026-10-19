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

// Improvement #3: also pre-cache the cross-encoder reranker so the hybrid
// search endpoint can rerank offline in production. Must match
// RERANK_MODEL_NAME default in src/services/reranker.ts.
const rerankModel = process.env.RERANK_MODEL_NAME || 'Xenova/bge-reranker-base';
console.log(`Downloading reranker model "${rerankModel}" into ${env.cacheDir} ...`);
const { AutoTokenizer, AutoModelForSequenceClassification } = await import('@xenova/transformers');
const rerankTokenizer = await AutoTokenizer.from_pretrained(rerankModel);
const rerankModelInstance = await AutoModelForSequenceClassification.from_pretrained(rerankModel, { quantized: true });
const warm = rerankTokenizer(['warmup query', 'warmup passage'], { padding: true, truncation: true });
await rerankModelInstance({ input_ids: warm.input_ids, attention_mask: warm.attention_mask });
console.log('Reranker model cached successfully.');
