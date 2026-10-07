import { Request, Response } from 'express';
import { z } from 'zod';
import { login } from '../services/auth.service';
import { ApiResponse } from '../types';
import { BadRequestError, UnauthorizedError } from '../utils/errors';
import logger from '../utils/logger';
import { query } from '../utils/database';

export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export const loginController = async (req: Request, res: Response<ApiResponse>): Promise<void> => {
  try {
    const validated = loginSchema.parse(req.body);
    const result = await login(validated);

    logger.info('Login successful', { email: result.user.email, userId: result.user.id });

    res.status(200).json({
      success: true,
      data: result,
      message: 'Login successful',
    } as ApiResponse);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new BadRequestError(error.errors.map((e: any) => e.message).join(', '));
    }
    throw error;
  }
};

export const getMeController = async (req: any, res: Response<ApiResponse>): Promise<void> => {
  const user = req.user;
  if (!user) {
    throw new UnauthorizedError('Not authenticated');
  }

  const result = await query(
    `SELECT id, employee_number, first_name, last_name, display_name, email, phone, role, status, timezone, metadata, business_id FROM staff_users WHERE id = $1 AND deleted_at IS NULL`,
    [user.id]
  );

  const dbUser = result.rows[0];
  if (!dbUser) {
    throw new UnauthorizedError('User not found');
  }

  const { password_hash: _, ...safeUser } = dbUser;
  res.status(200).json({
    success: true,
    data: safeUser,
  } as ApiResponse);
};

