import { Router, Request, Response } from 'express';
import { loginController, getMeController } from '../controllers/auth.controller';
import { validateBody } from '../middleware/validation';
import { authRateLimiter } from '../middleware/rateLimiter';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/login', authRateLimiter, validateBody(loginSchema), loginController);
router.get('/me', authenticate, getMeController);

export default router;
