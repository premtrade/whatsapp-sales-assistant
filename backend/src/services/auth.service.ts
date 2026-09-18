import bcrypt from 'bcrypt';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { query } from '../utils/database';
import { config } from '../config';
import logger from '../utils/logger';
import { UnauthorizedError, BadRequestError } from '../utils/errors';

export interface StaffUser {
  id: string;
  employee_number: string;
  first_name: string;
  last_name: string;
  display_name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  timezone: string;
  metadata: Record<string, unknown>;
  password_hash?: string;
  created_at: Date;
  updated_at: Date;
  business_id?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: Omit<StaffUser, 'password_hash'>;
  token: string;
  expiresIn: string;
}

export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function login(req: LoginRequest): Promise<AuthResponse> {
  const normalizedEmail = req.email.toLowerCase().trim();
  const sanitizedPassword = req.password;

  const result = await query<StaffUser>(
    'SELECT id, employee_number, first_name, last_name, display_name, email, phone, role, status, timezone, metadata, password_hash, created_at, updated_at, business_id FROM staff_users WHERE email = $1',
    [normalizedEmail]
  );

  const user = result.rows[0];

  if (!user) {
    logger.warn('Login attempt with non-existent email', { email: normalizedEmail });
    throw new UnauthorizedError('Invalid email or password');
  }

  if (user.status !== 'active') {
    logger.warn('Login attempt with inactive account', { email: normalizedEmail, status: user.status });
    throw new UnauthorizedError('Account is inactive');
  }

  if (!user.password_hash) {
    throw new UnauthorizedError('Password not set for this account');
  }

  const isValid = await verifyPassword(sanitizedPassword, user.password_hash);

  if (!isValid) {
    logger.warn('Failed login attempt', { email: normalizedEmail, userId: user.id });
    throw new UnauthorizedError('Invalid email or password');
  }

  // Ensure tenant identifier is resolved
  let tenantId = user.business_id;
  if (!tenantId) {
    const defaultBiz = await query<{ id: string }>('SELECT id FROM businesses ORDER BY created_at ASC LIMIT 1');
    tenantId = defaultBiz.rows[0]?.id;
    if (tenantId) {
      await query('UPDATE staff_users SET business_id = $1 WHERE id = $2', [tenantId, user.id]);
      user.business_id = tenantId;
    }
  }

  const token = jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      firstName: user.first_name,
      lastName: user.last_name,
      businessId: user.business_id,
      tenantId: user.business_id,
    },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'] }
  );

  logger.info('User logged in successfully', { userId: user.id, email: normalizedEmail, businessId: user.business_id });

  const { password_hash: _, ...safeUser } = user;

  return {
    user: safeUser,
    token,
    expiresIn: config.jwt.expiresIn,
  };
}

export async function validateToken(token: string): Promise<StaffUser | null> {
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload & { userId: string; businessId?: string; tenantId?: string };
    const result = await query<StaffUser>(
      'SELECT id, employee_number, first_name, last_name, display_name, email, phone, role, status, timezone, metadata, created_at, updated_at, business_id FROM staff_users WHERE id = $1 AND status = $2',
      [decoded.userId, 'active']
    );
    const user = result.rows[0];
    if (user && !user.business_id && (decoded.businessId || decoded.tenantId)) {
      user.business_id = decoded.businessId || decoded.tenantId;
    }
    return user || null;
  } catch {
    return null;
  }
}
