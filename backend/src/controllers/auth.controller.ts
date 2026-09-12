import { Request, Response } from 'express';
import { z } from 'zod';
import { login } from '../services/auth.service';
import { ApiResponse } from '../types';
import { BadRequestError, UnauthorizedError } from '../utils/errors';
import logger from '../utils/logger';

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
      throw new BadRequestError(error.errors.map((e) => e.message).join(', '));
    }
    throw error;
  }
};
