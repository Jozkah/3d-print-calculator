-- 027: UV printing
-- =============================================================================
-- Adds the ink catalogue, the UV substrate catalogue, the UV minimum job price,
-- and the UV columns on quotes. Requires 026.
--
-- The pricing rule this schema encodes: every ink carries two prices. The
-- client is always billed at the OEM price (uv_ink_cost); the refill price only
-- ever affects what the job actually cost us (uv_ink_cost_actual). Keeping both
-- on the row is what lets history show real margin without re-deriving it from
-- ink levels that have since changed.
-- =============================================================================

-- Ink catalogue ---------------------------------------------------------------
-- One row per ink channel. oem_volume_ml deliberately counts PRINTING ml only:
-- dividing the whole kit price (which also buys cleaner) by the printing ml is
-- what recovers the cleaner's cost through the ink actually sold.
CREATE TABLE IF NOT EXISTS uv_inks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  color_key TEXT NOT NULL UNIQUE
    CHECK (color_key IN ('cyan', 'magenta', 'yellow', 'black', 'white', 'gloss')),
  name TEXT NOT NULL,
  hex TEXT NOT NULL DEFAULT '#000000',
  oem_price NUMERIC NOT NULL DEFAULT 0,
  oem_volume_ml NUMERIC NOT NULL DEFAULT 0,
  -- NULL = no third-party refill recorded; €/ml then falls back to OEM.
  refill_price NUMERIC,
  refill_volume_ml NUMERIC,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seeded at 0 so the settings page shows its "priced at 0/ml" warning until the
-- operator enters a real kit price. Guessing one would silently under-quote.
INSERT INTO uv_inks (color_key, name, hex, sort_order) VALUES
  ('cyan',    'Cyan',            '#00AEEF', 1),
  ('magenta', 'Magenta',         '#EC008C', 2),
  ('yellow',  'Yellow',          '#FFF200', 3),
  ('black',   'Black',           '#231F20', 4),
  ('white',   'White',           '#FFFFFF', 5),
  ('gloss',   'Gloss / varnish', '#C9D4DD', 6)
ON CONFLICT (color_key) DO NOTHING;

-- UV substrate catalogue ------------------------------------------------------
-- Deliberately separate from laser_materials: the two stock lists barely
-- overlap in practice.
CREATE TABLE IF NOT EXISTS uv_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT,
  pricing_unit TEXT NOT NULL DEFAULT 'piece'
    CHECK (pricing_unit IN ('sheet', 'area', 'length', 'piece')),
  price NUMERIC NOT NULL DEFAULT 0,
  sheet_width_cm NUMERIC,
  sheet_height_cm NUMERIC,
  stock_qty NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pricing lever ---------------------------------------------------------------
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS uv_min_job_price NUMERIC DEFAULT 15;

-- Quote payloads --------------------------------------------------------------
-- uv_items rows carry quantity, pieces_per_run, the resolved run count, per-run
-- ink ml per colour, and the per-piece cost/sell figures computed at save time.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS uv_items JSONB DEFAULT '[]'::jsonb;
-- uv_operations rows carry the work step plus its resolved occurrence count.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS uv_operations JSONB DEFAULT '[]'::jsonb;
-- Billed at OEM — this is the figure the client's price is built from.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS uv_ink_cost NUMERIC DEFAULT 0;
-- What the ink actually cost with refills loaded. Internal only: never rendered
-- on the quote or invoice documents.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS uv_ink_cost_actual NUMERIC DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_uv_inks_sort_order ON uv_inks(sort_order);
CREATE INDEX IF NOT EXISTS idx_uv_materials_name ON uv_materials(name);
