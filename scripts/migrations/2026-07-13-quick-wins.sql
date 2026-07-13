-- Quick wins (#33 #34 #35 #39): configurable VAT rate / currency symbol /
-- quote validity in global_settings, plus per-quote vat_rate and valid_until.
-- Idempotent: safe to run more than once on an existing database.
-- Fresh installs get these columns from scripts/schema.sql directly.

-- Global settings: shop-wide defaults
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS vat_rate NUMERIC DEFAULT 0.23;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS currency_symbol TEXT DEFAULT '€';
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS validity_days INTEGER DEFAULT 30;

-- Quotes: persist the VAT rate each quote was priced with (so old documents
-- keep rendering with their original rate) and when the quote stops being valid.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS vat_rate NUMERIC;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ;
