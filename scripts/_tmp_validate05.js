const input = $('When Executed by Another Workflow').first()?.json || {};
const preferredDate = input.preferred_date;
const preferredTime = input.preferred_time;
const durationMinutes = Number(input.duration_minutes || 60);

if (!preferredDate || !preferredTime) {
  return [{
    json: {
      success: false,
      appointment_ready: false,
      error: 'Appointment requires a preferred_date and preferred_time.',\n      contact_id: input.contact_id,\n      conversation_id: input.conversation_id
    }
  }];
}

const dateTimeString = `${preferredDate}T${preferredTime}:00`;
const dateTime = new Date(dateTimeString);

if (isNaN(dateTime.getTime())) {
  return [{
    json: {
      success: false,
      appointment_ready: false,
      error: 'Supplied date or time string is invalid.',
      contact_id: input.contact_id,
      conversation_id: input.conversation_id
    }
  }];
}

const endTime = new Date(dateTime.getTime() + (durationMinutes * 60 * 1000));

return [{
  json: {
    success: true,
    appointment_ready: true,
    contact_id: input.contact_id,
    conversation_id: input.conversation_id,
    appointment_type: input.appointment_type || 'site_visit',
    title: input.title || 'Site Visit',
    location: input.location || null,
    starts_at: dateTime.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    ends_at: endTime.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    duration_minutes: durationMinutes
  }
}];