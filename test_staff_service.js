const { getStaffUserById } = require('./dist/services/staff.service');

(async () => {
  try {
    const user = await getStaffUserById('0df8d565-ed2b-4970-afde-7981ef765f76');
    console.log(JSON.stringify(user, null, 2));
  } catch (e) {
    console.error('ERROR:', e.message);
    console.error(e.stack);
  }
})();
