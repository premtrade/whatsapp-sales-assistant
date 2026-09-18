const items = $input.all();
return items.map(item => {
  const name = item.json.display_name || 'there';
  const message = `Hello ${name}, I wanted to follow up on the quote we sent for your construction project. Do you have any questions or would you like to discuss any details? We are here to help!`;
  return { json: { ...item.json, message, follow_up_type: '24h', template_used: 'quote_follow_up_24h' } };
});