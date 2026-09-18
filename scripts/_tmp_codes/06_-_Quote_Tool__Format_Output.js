const calc = $('Calculate Quote Details').first()?.json || {};
if (!calc.success) {
  return [{ json: { error: true, message: calc.error } }];
}

const created = $('Create Quote Record').first()?.json || {};

let message;
if (calc.requires_review) {
  message = `I've logged your request for a quote on ${calc.product_name}. A Garco representative will confirm pricing and details with you shortly.`;
} else {
  message = `Quote ${created.quote_number} generated for ${calc.product_name}. Subtotal: ${created.currency} ${Number(calc.subtotal).toLocaleString('en-US', {minimumFractionDigits: 2})}. Total: ${created.currency} ${Number(created.total).toLocaleString('en-US', {minimumFractionDigits: 2})}. Valid until ${created.valid_until}.`;
}

return [{
  json: {
    success: true,
    message,
    quote: {
      quote_number: created.quote_number,
      product: calc.product_name,
      quantity: calc.quantity,
      unit_price: calc.unit_price,
      subtotal: calc.subtotal,
      total: created.total,
      currency: created.currency,
      valid_until: created.valid_until,
      requires_review: calc.requires_review,
      metadata: calc.metadata
    }
  }
}];