import { Router, Request, Response } from 'express';
import { getDashboard } from '../controllers/dashboard.controller';
import { authenticate } from '../middleware/auth';
import { requireActiveSubscription } from '../middleware/subscription';
import { query } from '../utils/database';
import { getWhatsAppStatus } from '../services/whatsappConfig.service';

const router = Router();

router.use(authenticate);
router.use(requireActiveSubscription);

router.get('/dashboard', getDashboard);

router.get('/onboarding', async (req: Request, res: Response): Promise<void> => {
  const user = (req as Request & { user?: { businessId?: string; tenantId?: string } }).user;
  const businessId = user?.businessId || user?.tenantId;
  if (!businessId) {
    res.status(400).json({ success: false, message: 'Business context required' });
    return;
  }

  const [knowledgeResult, messageResult, whatsapp] = await Promise.all([
    query<{ complete: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM knowledge_documents
         WHERE business_id = $1 AND status = 'indexed'
       ) AS complete`,
      [businessId]
    ),
    query<{ complete: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
         WHERE c.business_id = $1 AND m.direction = 'outgoing'
       ) AS complete`,
      [businessId]
    ),
    getWhatsAppStatus(businessId).catch(() => ({ connected: false })),
  ]);

  res.json({
    success: true,
    data: {
      whatsappConnected: whatsapp.connected,
      hasKnowledge: knowledgeResult.rows[0]?.complete ?? false,
      hasSentMessage: messageResult.rows[0]?.complete ?? false,
    },
  });
});

export default router;
