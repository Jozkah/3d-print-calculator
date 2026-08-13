-- Sequential per-year quote reference ("Q-2026-001").
--
-- Minted at save time by lib/quote-number.ts using the existing counters
-- table (key "quote-YYYY", same mechanism as invoice numbering), and
-- backfilled onto pre-existing quotes the first time the history or
-- dashboard page loads.

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS quote_number TEXT;

CREATE INDEX IF NOT EXISTS idx_quotes_quote_number ON quotes(quote_number);
