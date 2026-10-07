import { Router } from 'express';
import { z } from 'zod';
import { signup } from '../services/signup.service';
import { login } from '../services/auth.service';
import { isFeatureEnabled } from '../services/featureFlag.service';
import { validateBody } from '../middleware/validation';
import { createRateLimiter } from '../middleware/rateLimiter';
import { AppError } from '../utils/errors';
import { ApiResponse } from '../types';

/**
 * Item 3 — Public signup endpoint (gated by the `signup_open` +
 * `public_beta_enabled` feature flags). Mounted at /api/auth in app.ts
 * alongside the existing login route.
 */

const signupSchema = z.object({
  businessName: z.string().min(2, 'Business name is required').max(255),
  ownerFirstName: z.string().min(1, 'First name is required').max(100),
  ownerLastName: z.string().min(1, 'Last name is required').max(100),
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  planCode: z.enum(['starter', 'professional', 'business']).optional(),
});

// Signup gets its own stricter limiter (5 per hour per IP) to blunt
// abuse of the free-trial provisioning flow.
const signupRateLimiter = createRateLimiter(60 * 60 * 1000, 5);

const router = Router();

router.post('/signup', signupRateLimiter, validateBody(signupSchema), async (req, res, next) => {
  try {
    if (!(await isFeatureEnabled('signup_open'))) {
      throw new AppError(
        'Signups are currently invite-only. Please check back soon.',
        403,
        'SIGNUP_CLOSED'
      );
    }
    if (!(await isFeatureEnabled('public_beta_enabled'))) {
      throw new AppError('The beta is not open yet.', 403, 'BETA_NOT_OPEN');
    }

    const validated = signupSchema.parse(req.body);
    const created = await signup(validated);

    // Auto-login the new owner so they land directly in the workspace.
    let authResult;
    try {
      authResult = await login({ email: validated.email, password: validated.password });
    } catch {
      authResult = undefined;
    }

    res.status(201).json({
      success: true,
      data: { ...created, ...(authResult ? { token: authResult.token, user: authResult.user } : {}) },
      message: 'Trial started — welcome to WAFLO!',
    } as ApiResponse);
  } catch (error) {
    next(error);
  }
});

export default router;
