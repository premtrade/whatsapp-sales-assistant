const items = $input.all();
return items.map(item => {
  const name = item.json.display_name || 'there';
  const message = `Hi ${name}, I hope you had a chance to review the quote for your construction project. If you would like to proceed or have any questions, please let us know. We would be happy to schedule a site visit if needed.`;
  return { json: { ...item.json, message, follow_up_type: '3day', template_used: 'quote_follow_up_3day' } };
});