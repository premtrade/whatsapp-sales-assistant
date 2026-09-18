const items = $input.all();
let knowledge = [];
const firstItem = items[0]?.json || {};

if (firstItem.knowledge && Array.isArray(firstItem.knowledge)) {
  knowledge = firstItem.knowledge;
} else if (firstItem.success && Array.isArray(firstItem.data)) {
  knowledge = firstItem.data.map(hit => {
    const chunk_text = hit.chunk_text || '';
    const metadata = hit.metadata || {};
    return {
      chunk_text,
      metadata,
      source: typeof metadata === 'string' ? metadata : (hit.source || metadata.title || metadata.document_title || '')
    };
  }).filter(k => !!k.chunk_text);
} else if (firstItem.result && Array.isArray(firstItem.result)) {
  knowledge = firstItem.result.map(hit => {
    const payload = hit.payload || {};
    const chunk_text = payload.chunk_text || payload.pageContent || '';
    const metadata = payload.metadata || payload || {};
    return {
      chunk_text,
      metadata,
      source: typeof metadata === 'string' ? metadata : (metadata.title || metadata.document_title || '')
    };
  }).filter(k => !!k.chunk_text);
} else {
  knowledge = items
    .map(item => {
      const doc = item.json.document || item.json || {};
      const chunk_text = doc.pageContent || doc.chunk_text || item.json.chunk_text || '';
      if (!chunk_text) return null;
      const metadata = doc.metadata || item.json.metadata || {};
      return {
        chunk_text,
        metadata,
        source: typeof metadata === 'string' ? metadata : (metadata.title || metadata.document_title || ''),
        score: item.json.score ?? null
      };
    })
    .filter(Boolean);
}

return [{ json: { knowledge } }];