import { Router, Response } from 'express';
import { z } from 'zod';
import { signupBusiness, checkSlugAvailability, checkPhoneAvailability } from '../services/public.service';
import { activateBusiness } from '../services/public.service';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/errors';
import logger from '../utils/logger';
import { authenticate } from '../middleware/auth';

const router = Router();

const signupSchema = z.object({
  businessName: z.string().min(1, 'Business name is required').max(255),
  slug: z.string().min(3, 'Slug must be at least 3 characters').max(50),
  whatsappPhone: z.string().min(1, 'WhatsApp phone is required'),
  ownerName: z.string().min(1, 'Owner name is required'),
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

router.post('/signup', async (req: any, res: Response): Promise<void> => {
  try {
    const validated = signupSchema.parse(req.body);
    const result = await signupBusiness(validated);
    res.status(201).json({
      success: true,
      data: result,
      message: 'Account created successfully',
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, message: error.errors.map((e: any) => e.message).join(', ') });
      return;
    }
    if (error instanceof ConflictError) {
      res.status(409).json({ success: false, message: error.message });
      return;
    }
    if (error instanceof BadRequestError) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }
    logger.error('Signup failed', { error: error?.message || error });
    res.status(500).json({ success: false, message: 'Signup failed. Please try again.' });
  }
});

router.get('/business/slug/:slug/available', async (req: any, res: Response): Promise<void> => {
  try {
    const result = await checkSlugAvailability(req.params.slug);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error?.message || 'Invalid slug' });
  }
});

router.get('/business/phone/:phone/available', async (req: any, res: Response): Promise<void> => {
  try {
    const result = await checkPhoneAvailability(req.params.phone);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error?.message || 'Invalid phone number' });
  }
});

router.patch('/business/:id/activate', authenticate, async (req: any, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }
    const result = await activateBusiness(req.params.id, user?.businessId, user?.role);
    res.json({ success: true, data: result, message: 'Business activated successfully' });
  } catch (error: any) {
    if (error instanceof NotFoundError) {
      res.status(404).json({ success: false, message: error.message });
      return;
    }
    logger.error('Business activation failed', { error: error?.message || error });
    res.status(500).json({ success: false, message: 'Activation failed' });
  }
});

export default router;
