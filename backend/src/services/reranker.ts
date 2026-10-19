import logger from '../utils/logger';

// Dynamic import keeps @xenova/transformers OFF the module graph at load time:
// jest (ts-jest, CJS) cannot parse the package's ESM source, and tests that
// import knowledge.service would fail before a single assertion runs. The cost
// is one cached promise on first rerank call.
type AnyModel = any;

// Cross-encoder reranker (improvement #3 of the retrieval upgrade).
// Bi-encoder cosine similarity (all-mpnet-base-v2) is fast but shallow: it
// compares query and chunk SEPARATELY, so a chunk that merely repeats the
// question's keywords can outrank the chunk that actually answers it. A
// cross-encoder reads query AND chunk together and is dramatically more
// accurate — but O(n) per query, so it only reranks the cosine top-K.
//
// bge-reranker-base has num_labels=1: the model emits ONE raw logit per pair,
// and relevance = sigmoid(logit). We drive tokenizer+model directly instead of
// the text-classification pipeline because pipeline post-processing assumes
// multi-label softmax and would mangle a single-logit score.
const RERANK_MODEL = process.env.RERANK_MODEL_NAME || 'Xenova/bge-reranker-base';
const MAX_LENGTH = 512;
// Nothing beyond the cosine top-20 is worth scoring (reranker cost is linear).
export const RERANK_CANDIDATES = 20;

let tokenizerPromise: Promise<unknown> | null = null;
let modelPromise: Promise<unknown> | null = null;
// Set to true after a failed load so we don't retry (and re-warn) on every query.
let rerankBroken = false;

export function isRerankEnabled(): boolean {
  return process.env.RERANK_ENABLED !== 'false' && !rerankBroken;
}

async function getModels(): Promise<{ tokenizer: AnyModel; model: AnyModel }> {
  if (!tokenizerPromise) {
    tokenizerPromise = (async () => {
      const { AutoTokenizer } = await import('@xenova/transformers');
      return AutoTokenizer.from_pretrained(RERANK_MODEL);
    })();
  }
  if (!modelPromise) {
    modelPromise = (async () => {
      const { AutoModelForSequenceClassification } = await import('@xenova/transformers');
      return AutoModelForSequenceClassification.from_pretrained(RERANK_MODEL, {
        quantized: true,
      });
    })();
  }
  const [tokenizer, model] = await Promise.all([tokenizerPromise, modelPromise]);
  return { tokenizer: tokenizer as AnyModel, model: model as AnyModel };
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

// Reranks candidate texts against the query. Returns indices sorted by
// descending relevance score. Returns null on ANY failure (model missing,
// OOM, timeout) so the caller falls back to the cosine ordering — retrieval
// must never break because the reranker is unavailable.
export async function rerank(
  query: string,
  candidates: string[]
): Promise<{ index: number; score: number }[] | null> {
  if (!query || candidates.length === 0) return null;
  if (candidates.length === 1) return [{ index: 0, score: 1 }];

  try {
    const { tokenizer, model } = await getModels();

    // Batch ALL pairs in one forward pass: [query, cand_0] ... [query, cand_n].
    const pairs = candidates.map((text) => [query, text]);
    const encoded = tokenizer(pairs, {
      padding: true,
      truncation: true,
      max_length: MAX_LENGTH,
    });

    const output = await model({
      input_ids: encoded.input_ids,
      attention_mask: encoded.attention_mask,
    });

    const logits = output.logits as { data: ArrayLike<number>; dims: number[] };
    const values = Array.prototype.slice.call(logits.data) as number[];

    // Single-logit model: logits.data = [logit_0, ..., logit_n] (batch dim 1
    // squeezed by ONNX export). Handle an unsqueezed [batch, 1] shape too.
    const stride = values.length / candidates.length;
    const scores: number[] = [];
    if (stride >= 1 && Number.isInteger(stride)) {
      for (let i = 0; i < candidates.length; i++) {
        const logit = values[i * stride];
        if (logit === undefined) throw new Error(`Missing reranker logit at index ${i}`);
        scores.push(sigmoid(logit));
      }
    } else {
      throw new Error(`Unexpected reranker logits shape: length ${values.length} for ${candidates.length} candidates`);
    }

    return scores
      .map((score, index) => ({ index, score }))
      .sort((a, b) => b.score - a.score);
  } catch (error) {
    rerankBroken = true;
    logger.warn('Reranker unavailable, falling back to cosine ordering', {
      model: RERANK_MODEL,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}