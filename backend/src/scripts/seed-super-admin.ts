import { query } from '../utils/database';
import { hashPassword } from '../services/auth.service';

async function seedSuperAdmin() {
  const email = 'owner@waflo.app';
  const password = 'ChangeMeNow!123';

  const existing = await query(`SELECT id FROM staff_users WHERE email = $1 AND role = 'super_admin'`, [email]);
  if (existing.rows.length > 0) {
    console.log('Super admin already exists:', email);
    return;
  }

  const passwordHash = await hashPassword(password);
  const result = await query(
    `INSERT INTO staff_users (employee_number, first_name, last_name, email, role, status, timezone, password_hash, business_id)
     VALUES ($1, $2, $3, $4, 'super_admin', 'active', $5, $6, NULL)
     RETURNING id, email, role`,
    ['OWNER-001', 'Platform', 'Owner', email, 'America/Jamaica', passwordHash]
  );

  console.log('Created super admin:', result.rows[0]);
  console.log('Login with:', email, '/', password);
}

seedSuperAdmin().catch((err) => {
  console.error('Failed to seed super admin:', err);
  process.exit(1);
});
