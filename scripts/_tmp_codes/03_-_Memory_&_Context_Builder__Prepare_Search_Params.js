const embeddingResult = $('Generate Message Embedding').first()?.json;
const message = $('When Executed by Another Workflow').first()?.json?.message || '';

let embedding = null;
if (embeddingResult && Array.isArray(embeddingResult) && embeddingResult.length > 0) {
  embedding = embeddingResult[0];
} else if (embeddingResult && embeddingResult[0] && Array.isArray(embeddingResult[0])) {
  embedding = embeddingResult[0];
}

const hasValid = Boolean(embedding && Array.isArray(embedding) && embedding.length === 768);
const dummyUnitVector = [1, ...Array(767).fill(0)];
const vectorStr = hasValid ? '[' + embedding.join(',') + ']' : '[' + dummyUnitVector.join(',') + ']';

return [{
  json: {
    embedding_vector: vectorStr,
    message_text: message,
    has_vector: hasValid
  }
}];