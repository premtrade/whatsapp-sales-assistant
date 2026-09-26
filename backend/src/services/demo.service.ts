import { query } from '../utils/database';
import { BadRequestError } from '../utils/errors';
import { createBusiness } from './business.service';
import { createTrial } from './subscription.service';
import { hashPassword } from './auth.service';

export async function seedDemoBusiness(overrides?: { slug?: string; name?: string; email?: string; whatsappPhone?: string }): Promise<{ businessId: string; adminEmail: string; adminPassword: string }> {
  const slug = overrides?.slug || `demo-${Date.now().toString(36)}`;
  const name = overrides?.name || 'Demo Business';
  const email = overrides?.email || `demo-${Date.now().toString(36)}@example.com`;
  const whatsappPhone = overrides?.whatsappPhone || `+1${Math.floor(1000000000 + Math.random() * 9000000000)}`;
  const adminPassword = 'Demo1234!';

  const business = await createBusiness({
    name,
    slug,
    whatsapp_phone: whatsappPhone,
    waha_session_name: `waha-${slug}`.slice(0, 100),
    currency: 'USD',
    timezone: 'America/New_York',
    status: 'active',
  });

  await createTrial(business.id, 'professional');

  const passwordHash = await hashPassword(adminPassword);
  await query(
    `INSERT INTO staff_users (employee_number, first_name, last_name, email, role, status, timezone, password_hash, business_id)
     VALUES ($1, $2, $3, $4, 'admin', 'active', $5, $6, $7)`,
    [`DEMO-${business.id.slice(0, 6).toUpperCase()}`, 'Demo', 'Admin', email, 'America/New_York', passwordHash, business.id]
  );

  return { businessId: business.id, adminEmail: email, adminPassword };
}
