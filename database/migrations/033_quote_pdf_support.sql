-- ==========================================================
-- Project : WhatsApp Sales Assistant
-- Migration: 033_quote_pdf_support
-- Purpose : Add PDF generation tracking fields to quotes
-- ==========================================================

-- Add PDF-related columns to quotes table
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS pdf_url TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS sent_via VARCHAR(20);

-- Index for finding quotes that still need PDF generation
CREATE INDEX IF NOT EXISTS idx_quotes_pdf_null ON quotes(id)
  WHERE pdf_url IS NULL AND status != 'draft';
