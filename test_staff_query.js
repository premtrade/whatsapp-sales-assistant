const { query } = require('./dist/utils/database');

(async () => {
  const r = await query(
    `SELECT id, employee_number, first_name, last_name, display_name, email, phone, role, status, timezone, metadata, created_at, updated_at, business_id FROM staff_users WHERE id = $1`,
    ['0df8d565-ed2b-4970-afde-7981ef765f76']
  );
  console.log(JSON.stringify(r.rows, null, 2));
})();
