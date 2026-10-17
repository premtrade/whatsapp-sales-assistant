import { query } from '../utils/database';
import { hashPassword } from '../services/auth.service';

async function seedSuperAdmin() {
  const email = process.env.PLATFORM_OWNER_EMAIL?.trim().toLowerCase();
  const password = process.env.PLATFORM_OWNER_PASSWORD;

  if (!email || !password) {
    throw new Error('Set PLATFORM_OWNER_EMAIL and PLATFORM_OWNER_PASSWORD to create or reset the platform owner.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('PLATFORM_OWNER_EMAIL must be a valid email address.');
  }
  if (password.length < 8) {
    throw new Error('PLATFORM_OWNER_PASSWORD must be at least 8 characters.');
  }

  const passwordHash = await hashPassword(password);
  // NOTE: migration 067 replaced the blanket UNIQUE(email) with partial index
  // uq_staff_users_email_active (non-deleted rows only), so ON CONFLICT (email)
  // no longer matches an arbiter. Target the partial index by predicate, and
  // revive a soft-deleted row with the same email instead of colliding on it.
  const result = await query(
    `INSERT INTO staff_users (employee_number, first_name, last_name, email, role, status, timezone, password_hash, business_id, deleted_at)
     VALUES ($1, $2, $3, $4, 'super_admin', 'active', $5, $6, NULL, NULL)
     ON CONFLICT (email) WHERE deleted_at IS NULL DO UPDATE
       SET role = 'super_admin', status = 'active', password_hash = EXCLUDED.password_hash,
           business_id = NULL, deleted_at = NULL, updated_at = NOW()
     RETURNING id, email, role`,
    ['OWNER-001', 'Platform', 'Owner', email, 'America/Jamaica', passwordHash]
  );

  console.log('Platform owner account created or recovered:', result.rows[0]);
}

seedSuperAdmin().catch((err) => {
  console.error('Failed to seed super admin:', err);
  process.exit(1);
});

