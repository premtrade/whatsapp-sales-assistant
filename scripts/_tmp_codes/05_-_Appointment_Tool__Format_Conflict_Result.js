const input = $('Validate Inputs').first().json;
const conflict = $('Check for Conflicts').first()?.json || {};
const hasConflict = Number(conflict.conflict_count || 0) > 0;

return [{
  json: {
    ...input,
    has_conflict: hasConflict
  }
}];