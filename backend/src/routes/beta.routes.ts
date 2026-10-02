import { Router, Response } from 'express';
import { z } from 'zod';
import {
  getBetaStatus,
  validateBetaInvite,
  recordBetaRegistration,
  createBetaInvite,
  listBetaInvites,
  revokeBetaInvite,
  isBetaOpen,
  setBetaOpen,
} from '../services/beta.service';
import { requireRole } from '../middleware/auth';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/errors';
import logger from '../utils/logger';

const router = Router();

// GET /beta/status — public, returns whether beta is open.
router.get('/status', async (_req, res: Response): Promise<void> => {
  try {
    const status = await getBetaStatus();
    res.json({ success: true, data: status });
  } catch (error: any) {
    logger.error('Failed to fetch beta status', { error: error?.message || error });
    res.status(500).json({ success: false, message: 'Failed to fetch beta status' });
  }
});

// POST /beta/validate-invite — public, validates an invite token or email.
const validateSchema = z.object({
  email: z.string().email('Invalid email format'),
  token: z.string().optional().default(''),
});

router.post('/validate-invite', async (req: any, res: Response): Promise<void> => {
  try {
    const { email, token } = validateSchema.parse(req.body);
    const result = await validateBetaInvite(email, token || undefined);
    res.json({ success: true, data: result });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, message: error.errors.map((e: any) => e.message).join(', ') });
      return;
    }
    logger.error('Beta invite validation failed', { error: error?.message || error });
    res.status(500).json({ success: false, message: 'Invite validation failed' });
  }
});

// POST /beta/register — public, records a beta registration.
// Does NOT create the account; used by the frontend to record intent before signup.
const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  inviteToken: z.string().optional().default(''),
});

router.post('/register', async (req: any, res: Response): Promise<void> => {
  try {
    const { email, inviteToken } = registerSchema.parse(req.body);
    const registration = await recordBetaRegistration({
      email,
      inviteToken: inviteToken || undefined,
      ipAddress: req.ip || req.connection.remoteAddress || undefined,
      userAgent: req.get('user-agent') || undefined,
    });
    res.status(201).json({ success: true, data: registration });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, message: error.errors.map((e: any) => e.message).join(', ') });
      return;
    }
    logger.error('Beta registration failed', { error: error?.message || error });
    res.status(500).json({ success: false, message: 'Registration failed' });
  }
});

// Admin beta invite management.
router.get('/invites', requireRole('super_admin'), async (_req, res: Response): Promise<void> => {
  try {
    const invites = await listBetaInvites();
    res.json({ success: true, data: invites });
  } catch (error: any) {
    logger.error('Failed to list beta invites', { error: error?.message || error });
    res.status(500).json({ success: false, message: 'Failed to list invites' });
  }
});

router.post('/invites', requireRole('super_admin'), async (req: any, res: Response): Promise<void> => {
  try {
    const schema = z.object({
      email: z.string().email().optional().default(''),
      domain: z.string().optional().default(''),
      token: z.string().min(1, 'Token is required'),
      inviteType: z.enum(['email', 'domain', 'promo']),
      maxUses: z.number().int().positive().optional().default(1),
      expiresAt: z.string().datetime().optional().default(''),
      metadata: z.record(z.unknown()).optional().default({}),
    });
    const { email, domain, token, inviteType, maxUses, expiresAt, metadata } = schema.parse(req.body);

    if (inviteType === 'email' && !email) {
      res.status(400).json({ success: false, message: 'Email is required for email invites' });
      return;
    }
    if (inviteType === 'domain' && !domain) {
      res.status(400).json({ success: false, message: 'Domain is required for domain invites' });
      return;
    }

    const invite = await createBetaInvite({
      email: email || undefined,
      domain: domain || undefined,
      token,
      inviteType,
      maxUses,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      metadata,
    });
    res.status(201).json({ success: true, data: invite });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, message: error.errors.map((e: any) => e.message).join(', ') });
      return;
    }
    logger.error('Failed to create beta invite', { error: error?.message || error });
    res.status(500).json({ success: false, message: 'Failed to create invite' });
  }
});

router.delete('/invites/:token', requireRole('super_admin'), async (req: any, res: Response): Promise<void> => {
  try {
    await revokeBetaInvite(req.params.token);
    res.json({ success: true, message: 'Invite revoked' });
  } catch (error: any) {
    logger.error('Failed to revoke beta invite', { error: error?.message || error });
    res.status(500).json({ success: false, message: 'Failed to revoke invite' });
  }
});

// Admin beta open/close toggle.
router.post('/toggle', requireRole('super_admin'), async (req: any, res: Response): Promise<void> => {
  try {
    const schema = z.object({ open: z.boolean() });
    const { open } = schema.parse(req.body);
    await setBetaOpen(open);
    res.json({ success: true, data: { open } });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, message: error.errors.map((e: any) => e.message).join(', ') });
      return;
    }
    logger.error('Failed to toggle beta', { error: error?.message || error });
    res.status(500).json({ success: false, message: 'Failed to toggle beta' });
  }
});

export { isBetaOpen };
export default router;
