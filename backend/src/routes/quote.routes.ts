import { Router, Request, Response } from 'express';
import { listQuotes, getQuote, updateQuoteStatusController } from '../controllers/quote.controller';
import { authenticate } from '../middleware/auth';
import { requireActiveSubscription } from '../middleware/subscription';
import { sanitizePagination } from '../middleware/validation';
import { generateQuotePDF } from '../services/pdf.service';
import { sendWahaDocument } from '../services/waha.service';
import { query } from '../utils/database';

const router = Router();

router.use(authenticate);
router.use(requireActiveSubscription);
router.use(sanitizePagination);

router.get('/', listQuotes);
router.get('/:id', getQuote);
router.patch('/:id/status', updateQuoteStatusController);

router.post('/:id/generate-pdf', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { phone } = req.body as { phone?: string };

    if (!phone) {
      res.status(400).json({ success: false, error: 'Phone number is required' });
      return;
    }

    const filepath = await generateQuotePDF(id!);

    const quoteResult = await query<{ quote_number: string }>(
      'SELECT quote_number FROM quotes WHERE id = $1', [id]
    );
    const quoteNumber = quoteResult.rows[0]?.quote_number;

    await sendWahaDocument({
      session: 'default',
      chatId: `${phone}@c.us`,
      filePath: filepath,
      filename: `Quote_${quoteNumber}.pdf`,
      caption: `Here's your official quote ${quoteNumber}. Valid for 14 days. To accept, reply 'I accept' or call us.`,
    });

    const publicUrl = `/storage/quotes/${filepath.split('/').pop()}`;
    await query('UPDATE quotes SET pdf_url = $1, sent_at = NOW(), sent_via = $2 WHERE id = $3',
      [publicUrl, 'whatsapp', id!]);

    res.json({ success: true, pdf_url: publicUrl });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
