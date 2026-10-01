import { Router } from 'express';
import { getWhatsAppConfigController, getWhatsAppStatusController, testWhatsAppConnectionController, connectWhatsAppSessionController, updateWhatsAppConfigController } from '../controllers/whatsappConfig.controller';
import { authenticate } from '../middleware/auth';
import { requireActiveSubscription } from '../middleware/subscription';

const router = Router();

router.use(authenticate);
router.use(requireActiveSubscription);

router.get('/config', getWhatsAppConfigController);
router.get('/status', getWhatsAppStatusController);
router.post('/connect', connectWhatsAppSessionController);
router.post('/test-connection', testWhatsAppConnectionController);
router.patch('/config', updateWhatsAppConfigController);

export default router;