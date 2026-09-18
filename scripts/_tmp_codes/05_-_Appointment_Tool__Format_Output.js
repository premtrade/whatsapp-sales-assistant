const input = $('Format Conflict Result').first()?.json || {};
if (input.has_conflict) {
  return [{ json: { error: true, message: 'Requested time conflicts with an existing appointment.', has_conflict: true } }];
}
if (!input.appointment_ready) {
  return [{ json: { error: true, message: input.error || 'Date and time required.' } }];
}

const created = $('Create Appointment').first()?.json || {};
return [{
  json: {
    success: true,
    message: `Appointment scheduled: ${created.title} on ${created.starts_at}.`,
    appointment: created
  }
}];