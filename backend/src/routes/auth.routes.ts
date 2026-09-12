import { Router, Request, Response } from 'express';
import { loginController, loginSchema } from '../controllers/auth.controller';
import { validateBody } from '../middleware/validation';
import { authRateLimiter } from '../middleware/rateLimiter';

const router = Router();

router.post('/login', authRateLimiter, validateBody(loginSchema), loginController);

export default router;
