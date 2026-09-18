const input = $('When Executed by Another Workflow').first()?.json || {};
const product = $('Find Product').first()?.json || null;

if (!product || !product.id) {
  return [{
    json: {
      success: false,
      error: `Product or service matching '${input.product_name_or_sku}' was not found in active inventory.`
    }
  }];
}

const quantity = Math.max(1, Number(input.quantity || 1));
const unitPrice = Number(product.price || 0);
const requiresReview = !product.price || Number(product.price) <= 0;
const subtotal = unitPrice * quantity;
const total = requiresReview ? 0 : subtotal;
const currency = input.currency || product.currency || 'JMD';
const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const randomSuffix = Math.floor(1000 + Math.random() * 9000);
const quoteNumber = `QT-${dateStr}-${randomSuffix}`;
const status = 'draft';
const reviewNote = requiresReview
  ? ' Pricing is not published; a Garco representative will confirm the final price.'
  : '';

return [{
  json: {
    success: true,
    contact_id: input.contact_id,
    conversation_id: input.conversation_id,
    quote_number: quoteNumber,
    product_id: product.id,
    product_name: product.name,
    quantity,
    unit_price: unitPrice,
    subtotal,
    total,
    currency,
    status,
    requires_review: requiresReview,
    notes: input.notes || 'Generated via AI Sales Tool',
    metadata: { requires_review: requiresReview, review_note: reviewNote }
  }
}];