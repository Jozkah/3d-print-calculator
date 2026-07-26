-- 026: bring the Postgres schema back in line with what the app writes
-- =============================================================================
-- The app moved to a browser-local data layer (lib/local-db.ts) and the SQL
-- schema stopped being updated, so several features shipped since then have no
-- columns to land in: the laser rework, invoicing, saved route distances,
-- filament stock, and quote templates. A Supabase deployment on the old schema
-- rejects those writes (PGRST204) rather than failing loudly in the UI.
--
-- Everything here is additive and idempotent. No column is dropped or renamed,
-- so existing rows keep working. Run this before 027.
-- =============================================================================

-- Global settings -------------------------------------------------------------
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS vat_rate NUMERIC DEFAULT 0.23;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS currency_symbol TEXT DEFAULT '€';
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS validity_days INTEGER DEFAULT 30;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS company_address TEXT;
-- Coordinates cached when the company address is geocoded, so the route dialog
-- does not re-geocode the home address on every quote.
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS company_lat NUMERIC;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS company_lon NUMERIC;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS company_email TEXT;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS company_phone TEXT;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS company_tax_id TEXT;
-- Logo is stored as a data URI (uploaded via file input, capped ~200KB).
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS company_logo TEXT;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS laser_min_job_price NUMERIC DEFAULT 15;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS sticker_min_job_price NUMERIC DEFAULT 10;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS default_setup_fee NUMERIC DEFAULT 5;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS qty_discount_tiers JSONB
  DEFAULT '[{"min_qty":10,"discount_pct":5},{"min_qty":50,"discount_pct":10}]'::jsonb;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Printers --------------------------------------------------------------------
-- Machine type was added in 005 and removed again in 007; the laser rework
-- reintroduced it. Deliberately not a CHECK constraint — 027 adds another value
-- and the app treats an absent value as "3d-printer".
ALTER TABLE printers ADD COLUMN IF NOT EXISTS machine_type TEXT DEFAULT '3d-printer';
-- Bundled product-image key from lib/printer-images.ts ("generic" opts out of
-- name matching); absent rows auto-match by name.
ALTER TABLE printers ADD COLUMN IF NOT EXISTS image_key TEXT;

-- Filaments -------------------------------------------------------------------
-- Spool inventory. NULL means stock is not tracked for that spool.
ALTER TABLE filaments ADD COLUMN IF NOT EXISTS grams_in_stock NUMERIC;
ALTER TABLE filaments ADD COLUMN IF NOT EXISTS low_stock_threshold_g NUMERIC DEFAULT 1000;

-- Laser materials -------------------------------------------------------------
-- The rework replaced "price_per_unit + unit" with an explicit pricing unit and
-- a price expressed in that unit. The old columns are left in place so existing
-- rows are readable; the backfill below carries their values across.
ALTER TABLE laser_materials ADD COLUMN IF NOT EXISTS pricing_unit TEXT DEFAULT 'sheet';
ALTER TABLE laser_materials ADD COLUMN IF NOT EXISTS price NUMERIC DEFAULT 0;
ALTER TABLE laser_materials ADD COLUMN IF NOT EXISTS sheet_width_cm NUMERIC;
ALTER TABLE laser_materials ADD COLUMN IF NOT EXISTS sheet_height_cm NUMERIC;
ALTER TABLE laser_materials ADD COLUMN IF NOT EXISTS stock_qty NUMERIC;
ALTER TABLE laser_materials ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE laser_materials ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE laser_materials ALTER COLUMN material_type DROP NOT NULL;

UPDATE laser_materials
   SET price = COALESCE(price_per_unit, 0),
       pricing_unit = CASE
         WHEN unit IN ('sheet', 'area', 'length', 'piece') THEN unit
         WHEN unit = 'roll' THEN 'length'
         WHEN unit = 'unit' THEN 'piece'
         ELSE 'sheet'
       END
 WHERE price IS NULL OR price = 0;

-- Quotes ----------------------------------------------------------------------
-- Laser/sticker line items, denormalized at save time.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS laser_items JSONB DEFAULT '[]'::jsonb;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS setup_fee NUMERIC DEFAULT 0;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS setup_fee_sell NUMERIC DEFAULT 0;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS discount_amount NUMERIC DEFAULT 0;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS min_job_price NUMERIC DEFAULT 0;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS min_price_applied BOOLEAN DEFAULT FALSE;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS min_price_adjustment NUMERIC DEFAULT 0;
-- The VAT fraction the quote was priced at, so documents re-render historically.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS vat_rate NUMERIC;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ;
-- Invoice fields, minted the first time the invoice document is opened.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS invoice_number TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS invoice_date TIMESTAMPTZ;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
-- Set once a quote reached "finished" and filament stock was decremented, so
-- repeated status flips never double-deduct inventory.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS stock_deducted BOOLEAN DEFAULT FALSE;
-- Route used to calculate distance_traveled_km; distance stays the single
-- source of truth for the fuel-cost math either way.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS route_origin JSONB;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS route_destination JSONB;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS route_is_round_trip BOOLEAN;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS route_one_way_km NUMERIC;

-- Per-year sequential counters (invoice numbering: key "invoice-2026") --------
CREATE TABLE IF NOT EXISTS counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reusable quote structures saved from an existing quote ----------------------
CREATE TABLE IF NOT EXISTS quote_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quotes_type_mode ON quotes(quote_type_mode);
CREATE INDEX IF NOT EXISTS idx_quotes_invoice_number ON quotes(invoice_number);
CREATE INDEX IF NOT EXISTS idx_printers_machine_type ON printers(machine_type);
CREATE INDEX IF NOT EXISTS idx_quote_templates_name ON quote_templates(name);
