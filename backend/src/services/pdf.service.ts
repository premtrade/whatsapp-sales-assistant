import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { query } from '../utils/database';

interface QuoteData {
  quote_number: string;
  customer_name: string;
  customer_phone: string;
  created_at: string;
  valid_until: string;
  items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
  notes: string;
}

export async function generateQuotePDF(quoteId: string): Promise<string> {
  const quoteResult = await query<QuoteData>(`
    SELECT
      q.quote_number, q.created_at, q.valid_until, q.subtotal, q.tax, q.total, q.currency, q.notes,
      c.display_name as customer_name, c.phone as customer_phone,
      COALESCE(json_agg(json_build_object('description', COALESCE(p.name, qi.description), 'quantity', qi.quantity, 'unit_price', qi.unit_price, 'line_total', qi.line_total)) FILTER (WHERE qi.id IS NOT NULL), '[]'::json) as items
    FROM quotes q
    JOIN contacts c ON q.contact_id = c.id
    LEFT JOIN quote_items qi ON qi.quote_id = q.id
    LEFT JOIN products p ON qi.product_id = p.id
    WHERE q.id = $1
    GROUP BY q.id, c.id
  `, [quoteId]);

  const data = quoteResult.rows[0];
  if (!data) throw new Error('Quote not found');

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const filename = `quote_${data.quote_number}_${Date.now()}.pdf`;
  const dir = path.join('/app/storage/quotes');
  fs.mkdirSync(dir, { recursive: true });
  const filepath = path.join(dir, filename);

  const stream = fs.createWriteStream(filepath);
  doc.pipe(stream);

  doc.fontSize(24).fillColor('#1a5276').text('GARCO CONSTRUCTION', 50, 50);
  doc.fontSize(10).fillColor('#666').text('Services Limited', 50, 75);
  // Per Garco's authoritative policy, do NOT assert a single office address
  // (the website lists conflicting addresses). Show contact channels only.
  doc.fontSize(8).text('Office location: please confirm via our website or phone');
  doc.text('Phone: +1 (876) 908-1970');
  doc.text('Web: https://www.garcoconstruction.com/');

  doc.fontSize(18).fillColor('#000').text('QUOTATION', 50, 130);

  const metaY = doc.y + 10;
  doc.fontSize(9);
  doc.text(`Quote #: ${data.quote_number}`, 50, metaY);
  doc.text(`Date: ${new Date(data.created_at).toLocaleDateString()}`, 50, metaY + 15);
  doc.text(`Valid Until: ${new Date(data.valid_until).toLocaleDateString()}`, 50, metaY + 30);
  doc.text(`Customer: ${data.customer_name}`, 300, metaY);
  doc.text(`Phone: ${data.customer_phone}`, 300, metaY + 15);

  const tableTop = metaY + 60;
  doc.fontSize(9).fillColor('#1a5276');
  doc.text('Description', 50, tableTop);
  doc.text('Qty', 280, tableTop);
  doc.text('Unit Price', 350, tableTop);
  doc.text('Total', 450, tableTop);
  doc.moveTo(50, tableTop + 15).lineTo(545, tableTop + 15).stroke();

  let rowY = tableTop + 25;
  doc.fontSize(9).fillColor('#000');
  for (const item of data.items || []) {
    doc.text(String(item.description || '').substring(0, 40), 50, rowY);
    doc.text(String(item.quantity), 280, rowY);
    doc.text(`${data.currency} ${Number(item.unit_price).toLocaleString()}`, 350, rowY);
    doc.text(`${data.currency} ${Number(item.line_total).toLocaleString()}`, 450, rowY);
    rowY += 20;
  }

  doc.moveTo(50, rowY + 5).lineTo(545, rowY + 5).stroke();
  rowY += 15;
  doc.text(`Subtotal: ${data.currency} ${Number(data.subtotal).toLocaleString()}`, 350, rowY);
  rowY += 15;
  doc.text(`Tax: ${data.currency} ${Number(data.tax).toLocaleString()}`, 350, rowY);
  rowY += 15;
  doc.fontSize(12).fillColor('#1a5276');
  doc.text(`TOTAL: ${data.currency} ${Number(data.total).toLocaleString()}`, 350, rowY);

  doc.fontSize(8).fillColor('#666');
  doc.text(
    'This is a preliminary estimate. Final pricing and payment terms will be confirmed by a Garco representative before any work begins.',
    50, 700, { width: 495, align: 'center' }
  );

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve(filepath));
    stream.on('error', reject);
  });
}
