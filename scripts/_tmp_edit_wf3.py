#!/usr/bin/env python3
"""Patch Workflow 03: switch embedding model to bge, fix retrieval threshold, add time greeting."""
import json
import os

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATH = os.path.join(REPO, "workflows", "03 - Memory & Context Builder.json")

EMBED_URL = "https://router.huggingface.co/hf-inference/models/BAAI/bge-base-en-v1.5"

EMBED_JSONBODY = "={{ { inputs: \"Represent this sentence for searching relevant passages: \" + String($('When Executed by Another Workflow').first().json.message || ''), options: { wait_for_model: true } } }}"

KNOWLEDGE_QUERY = r"""SELECT COALESCE(
  json_agg(
    json_build_object(
      'chunk_text', chunk_text,
      'metadata', metadata,
      'source', source,
      'similarity', similarity
    )
    ORDER BY similarity DESC
  ),
  '[]'::json
) AS knowledge
FROM (
  SELECT kc.chunk_text, kc.metadata, kd.title AS source, 1 - (kc.embedding <=> $1::vector) AS similarity
  FROM knowledge_chunks kc
  JOIN knowledge_documents kd ON kd.id = kc.document_id
  WHERE kd.status = 'indexed'
    AND kd.business_id = $4::uuid
    AND kc.embedding IS NOT NULL
    AND $3::boolean = true
    AND kc.chunk_text NOT ILIKE 'dummy content%'
    AND 1 - (kc.embedding <=> $1::vector) > 0.35
  UNION ALL
  SELECT kc.chunk_text, kc.metadata, kd.title AS source, COALESCE(similarity(kc.chunk_text, $2), 0) AS similarity
  FROM knowledge_chunks kc
  JOIN knowledge_documents kd ON kd.id = kc.document_id
  WHERE kd.status = 'indexed'
    AND kd.business_id = $4::uuid
    AND similarity(kc.chunk_text, $2) > 0.1
    AND kc.chunk_text NOT ILIKE 'dummy content%'
  ORDER BY similarity DESC
  LIMIT 10
) combined;"""

PREP_SEARCH_PARAMS = r"""const embeddingResult = $('Generate Message Embedding').first()?.json;
const message = $('When Executed by Another Workflow').first()?.json?.message || '';

let embedding = null;
if (embeddingResult && Array.isArray(embeddingResult) && embeddingResult.length > 0) {
  embedding = embeddingResult[0];
} else if (embeddingResult && embeddingResult[0] && Array.isArray(embeddingResult[0])) {
  embedding = embeddingResult[0][0];
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
}];"""

BUILD_CONTEXT_EXTRA = (
    "\nconst _h = new Date().toLocaleString('en-US', {timeZone:'America/Jamaica',hour:'2-digit',hour12:false});\n"
    "const _hr = parseInt(_h, 10);\n"
    "const _greet = _hr >= 12 && _hr < 17 ? 'afternoon' : _hr >= 17 && _hr < 21 ? 'evening' : 'morning';\n"
)


def find_node(wf, name):
    for n in wf.get("nodes", []):
        if n.get("name") == name:
            return n
    raise SystemExit(f"node not found: {name}")


def main():
    wf = json.load(open(PATH, encoding="utf-8"))
    emb = find_node(wf, "Generate Message Embedding")
    emb["parameters"]["url"] = EMBED_URL
    emb["parameters"]["jsonBody"] = EMBED_JSONBODY
    emb["parameters"]["options"]["timeout"] = 30000

    prep = find_node(wf, "Prepare Search Params")
    prep["parameters"]["jsCode"] = PREP_SEARCH_PARAMS

    kn = find_node(wf, "Get Knowledge Chunks (semantic)")
    kn["parameters"]["query"] = KNOWLEDGE_QUERY

    bc = find_node(wf, "Build Context Package")
    code = bc["parameters"]["jsCode"]
    code = code.replace(
        "business_name: business.name || settings.setting_value || 'our company',",
        "business_name: business.name || settings.setting_value || 'our company',\n    time_greeting: _greet,",
    )
    code = code + "\n" + BUILD_CONTEXT_EXTRA
    if "time_greeting" not in code:
        raise SystemExit("time_greeting injection failed")
    bc["parameters"]["jsCode"] = code

    with open(PATH, "w", encoding="utf-8") as f:
        json.dump(wf, f, indent=2, ensure_ascii=False)
    print("patched", PATH)


if __name__ == "__main__":
    main()
