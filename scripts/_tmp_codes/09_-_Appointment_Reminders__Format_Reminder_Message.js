const items = $input.all();
const now = new Date();
return items.map(item => {
  const startTime = new Date(item.json.starts_at);
  const hoursUntil = Math.round((startTime - now) / (1000 * 60 * 60));
  let reminderType = '48h';
  let message = '';
  const name = item.json.display_name || 'there';
  
  if (hoursUntil <= 2) {
    reminderType = '2h';
    message = `Hi ${name}, this is a friendly reminder that your appointment with Garco Construction is in 2 hours at ${startTime.toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'})}. Please ensure the site is accessible. See you soon!`;
  } else if (hoursUntil <= 24) {
    reminderType = '24h';
    message = `Hello ${name}, just a reminder that your appointment with Garco Construction is tomorrow at ${startTime.toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'})}. We look forward to meeting with you!`;
  } else {
    reminderType = '48h';
    message = `Hello ${name}, this is a friendly reminder that you have an appointment with Garco Construction on ${startTime.toLocaleDateString('en-US', {weekday: 'long', month: 'long', day: 'numeric'})} at ${startTime.toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'})}. We look forward to meeting with you!`;
  }
  
  return {
    json: {
      ...item.json,
      reminder_type: reminderType,
      message,
      hours_until: hoursUntil
    }
  };
});