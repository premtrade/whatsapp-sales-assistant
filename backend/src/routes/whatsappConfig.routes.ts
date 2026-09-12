import { Router } from 'express';
import { getWhatsAppConfigController, getWhatsAppStatusController, testWhatsAppConnectionController } from '../controllers/whatsappConfig.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/config', getWhatsAppConfigController);
router.get('/status', getWhatsAppStatusController);
router.post('/test-connection', testWhatsAppConnectionController);

export default router;