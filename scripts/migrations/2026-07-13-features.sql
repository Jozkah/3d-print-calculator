-- Phase features (#31 #32 #36 #37 #38 #40 #42 #43): invoices, business
-- identity letterhead, spool inventory, quote templates.
-- Idempotent: safe to run more than once on an existing database.
-- Fresh installs get all of this from scripts/schema.sql directly.

-- Global settings: business identity rendered as a letterhead on quote and
-- invoice documents (#32). company_logo holds a small data-URI image.
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS company_address TEXT;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS company_email TEXT;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS company_phone TEXT;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS company_tax_id TEXT;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS company_logo TEXT;

-- Quotes: invoice metadata (#31), minted on first visit to the invoice view,
-- plus the stock-deduction guard (#36) so a status round-trip through
-- "finished" can never deduct filament stock twice.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS invoice_number TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS invoice_date TIMESTAMPTZ;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS stock_deducted BOOLEAN DEFAULT FALSE;

-- Filaments: spool inventory (#36). NULL grams_in_stock = stock not tracked.
ALTER TABLE filaments ADD COLUMN IF NOT EXISTS grams_in_stock NUMERIC;
ALTER TABLE filaments ADD COLUMN IF NOT EXISTS low_stock_threshold_g NUMERIC DEFAULT 1000;

-- Per-year sequential counters, e.g. invoice numbering (id 'invoice-2026').
CREATE TABLE IF NOT EXISTS counters (
  id TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);

-- Reusable quote templates (#42): buildable structure only (parts, batches,
-- materials, labor, packaging, margins) — no client/pricing identity.
CREATE TABLE IF NOT EXISTS quote_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row-Level Security for the new tables: authenticated users only, same model
-- as every other table (see scripts/rls_policies.sql).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['counters','quote_templates']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t || '_authenticated_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true);',
      t || '_authenticated_all', t
    );
  END LOOP;
END $$;
