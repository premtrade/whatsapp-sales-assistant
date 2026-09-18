const items = $input.all();
return items.map(item => {
  const name = item.json.display_name || 'there';
  const message = `Hi ${name}, we noticed you haven't responded to our previous message. We're here to help with your construction project! If you have any questions or would like to continue the conversation, please let us know. We'd be happy to assist you.`;
  return {
    json: {
      ...item.json,
      message,
      recovery_attempt: true
    }
  };
});