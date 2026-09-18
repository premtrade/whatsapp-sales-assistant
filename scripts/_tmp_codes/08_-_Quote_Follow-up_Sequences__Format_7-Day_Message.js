const items = $input.all();
return items.map(item => {
  const name = item.json.display_name || 'there';
  const message = `Dear ${name}, as a valued prospective customer, I wanted to let you know we currently have availability for new projects. If you would like to move forward with your construction project, we would be pleased to offer you priority scheduling. Please let us know if you are interested!`;
  return { json: { ...item.json, message, follow_up_type: '7day', template_used: 'quote_follow_up_7day' } };
});