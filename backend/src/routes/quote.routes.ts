import { Router, Request, Response } from 'express';
import { listQuotes, getQuote, updateQuoteStatusController } from '../controllers/quote.controller';
import { authenticate } from '../middleware/auth';
import { requireActiveSubscription } from '../middleware/subscription';
import { sanitizePagination } from '../middleware/validation';
import { sendQuotePdfToCustomer } from '../services/quote.service';
import { AuthenticatedRequest } from '../types';
import { BadRequestError } from '../utils/errors';

const router = Router();

router.use(authenticate);
router.use(requireActiveSubscription);
router.use(sanitizePagination);

router.get('/', listQuotes);
router.get('/:id', getQuote);
router.patch('/:id/status', updateQuoteStatusController);

router.post('/:id/generate-pdf', async (req: Request, res: Response) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const businessId = user?.businessId || user?.tenantId;
    if (!businessId) {
      res.status(400).json({ success: false, error: 'Business context required' });
      return;
    }
    const result = await sendQuotePdfToCustomer(req.params.id!, businessId);
    res.json({ success: true, data: result, pdf_url: result.pdfUrl });
  } catch (error: unknown) {
    if (error instanceof BadRequestError) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = typeof error === 'object' && error !== null && 'statusCode' in error
      ? Number((error as { statusCode: unknown }).statusCode) || 500
      : 500;
    res.status(status).json({ success: false, error: message });
  }
});

export default router;
