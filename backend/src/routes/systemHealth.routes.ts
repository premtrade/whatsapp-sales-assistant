import { Router } from 'express';
import { getSystemHealthController, getSystemMetricsController } from '../controllers/systemHealth.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/health', getSystemHealthController);
router.get('/metrics', getSystemMetricsController);

export default router;