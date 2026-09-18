const item = $input.first()?.json || {};
const sanitize = (str) => typeof str === 'string' ? str.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF]/g, '') : str;
const messageId = item.message_id || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) { const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8); return v.toString(16); });
return [{
  json: {
    ...item,
    message: sanitize(item.message),
    customer_name: sanitize(item.customer_name),
    message_id: messageId
  }
}];