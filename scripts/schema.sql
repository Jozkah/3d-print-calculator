-- =============================================================================
-- 3D Print Cost Calculator — consolidated database schema
-- =============================================================================
-- Run this ONCE against a fresh Supabase/Postgres database to create everything
-- the app needs. It is the consolidated equivalent of the step-by-step files in
-- scripts/migrations/ (kept for history), reconciled to match what the app code
-- actually reads/writes.
--
-- AFTER running this, apply scripts/rls_policies.sql and review the security
-- notes in the README before exposing the app publicly.
--
-- NOTE: cost-calculator.tsx currently reads `global_settings.electricity_rate`
-- and `global_settings.vat_rate`, but the settings UI persists
-- `electricity_cost_per_kwh` (and there is no VAT column). Until that app-side
-- mismatch is reconciled, the calculator falls back to its built-in defaults
-- (electricity 0.15, VAT 0.23). See the README "Known issues" section.
-- =============================================================================

-- Global settings (single row) -----------------------------------------------
CREATE TABLE IF NOT EXISTS global_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  electricity_cost_per_kwh DECIMAL(10, 4) NOT NULL DEFAULT 0.20,
  fuel_cost_per_liter DECIMAL(10, 2) NOT NULL DEFAULT 2.00,
  car_fuel_consumption_per_100km DECIMAL(10, 2) NOT NULL DEFAULT 7.5,
  labor_hourly_rate DECIMAL(10, 2) NOT NULL DEFAULT 7.5,
  material_efficiency_factor DECIMAL(10, 2) NOT NULL DEFAULT 1.1,
  cost_buffer_factor DECIMAL(10, 2) NOT NULL DEFAULT 1.3,
  emergency_fee_fixed DECIMAL(10, 2) NOT NULL DEFAULT 10.00,
  double_heating_cost BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO global_settings (electricity_cost_per_kwh, fuel_cost_per_liter, car_fuel_consumption_per_100km, labor_hourly_rate)
VALUES (0.20, 2.00, 7.5, 7.5)
ON CONFLICT DO NOTHING;

-- Printers --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS printers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner TEXT DEFAULT 'Owner B',
  printer_cost DECIMAL(10, 2) NOT NULL DEFAULT 500.00,
  additional_upfront_cost DECIMAL(10, 2) NOT NULL DEFAULT 100.00,
  estimated_annual_maintenance DECIMAL(10, 2) NOT NULL DEFAULT 75.00,
  estimated_life_years DECIMAL(10, 2) NOT NULL DEFAULT 3.0,
  estimated_printer_uptime_percent DECIMAL(10, 4) NOT NULL DEFAULT 0.50,
  average_power_consumption_watts DECIMAL(10, 2) NOT NULL DEFAULT 150.00,
  has_enclosure BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO printers (name, owner, printer_cost, additional_upfront_cost, estimated_annual_maintenance, estimated_life_years, estimated_printer_uptime_percent, average_power_consumption_watts) VALUES
  ('Printer A', 'Owner A', 500.00, 100.00, 75.00, 3.0, 0.50, 150.00),
  ('Printer B', 'Owner B', 800.00, 50.00, 60.00, 4.0, 0.40, 120.00),
  ('Printer C', 'Owner B', 600.00, 30.00, 50.00, 3.5, 0.35, 100.00)
ON CONFLICT DO NOTHING;

-- Filaments / laser materials (shared table, distinguished by material_type) ---
CREATE TABLE IF NOT EXISTS filaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price_per_kg DECIMAL(10, 2),
  material_type TEXT DEFAULT 'filament',
  requires_heating BOOLEAN DEFAULT FALSE,
  heating_time_hours DECIMAL(10, 2) DEFAULT 0,
  brand TEXT,
  type TEXT,
  color TEXT,
  color_hex TEXT,
  thickness TEXT,
  size TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO filaments (name, price_per_kg) VALUES
  ('PLA', 18.00),
  ('PETG', 15.28),
  ('ABS', 11.55),
  ('ASA', 20.99),
  ('TPU', 25.00)
ON CONFLICT DO NOTHING;

-- Dedicated laser-material catalogue -----------------------------------------
CREATE TABLE IF NOT EXISTS laser_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  material_type TEXT NOT NULL,
  price_per_unit NUMERIC,
  unit TEXT DEFAULT 'sheet',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO laser_materials (name, material_type, price_per_unit, unit) VALUES
  ('Plywood Sheet', 'PLYWOOD', NULL, 'sheet'),
  ('Basswood Sheet', 'BASSWOOD', NULL, 'sheet'),
  ('Vinyl Roll', 'VINYL', NULL, 'roll'),
  ('Custom Item', 'CUSTOM ITEM', NULL, 'unit')
ON CONFLICT DO NOTHING;

-- Clients ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Quotes (multi-part data lives in JSONB columns) -----------------------------
CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_type TEXT NOT NULL CHECK (quote_type IN ('personal', 'business')),
  quote_name TEXT,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending',
  is_draft BOOLEAN DEFAULT FALSE,
  vat_enabled BOOLEAN DEFAULT TRUE,
  quote_type_mode TEXT,
  selected_margin TEXT,
  selected_margin_percentage NUMERIC,
  custom_margin_value NUMERIC,
  final_price NUMERIC,
  -- Multi-part payloads
  printed_parts JSONB DEFAULT '[]'::jsonb,
  dried_batches JSONB DEFAULT '[]'::jsonb,
  materials JSONB DEFAULT '[]'::jsonb,
  labor_items JSONB DEFAULT '[]'::jsonb,
  packaging_items JSONB DEFAULT '[]'::jsonb,
  is_emergency BOOLEAN DEFAULT FALSE,
  -- Roll-up costs
  machine_cost NUMERIC,
  drying_cost NUMERIC,
  materials_cost NUMERIC,
  labor_cost NUMERIC,
  packaging_cost NUMERIC,
  fuel_cost NUMERIC,
  electricity_cost NUMERIC,
  emergency_fee NUMERIC,
  landed_cost NUMERIC,
  -- Profit split
  owner_a_receives NUMERIC DEFAULT 0,
  owner_b_receives NUMERIC DEFAULT 0,
  ownerA_machine_cost NUMERIC,
  ownerB_machine_cost NUMERIC,
  ownerA_electricity_cost NUMERIC,
  ownerB_electricity_cost NUMERIC,
  -- Legacy roll-up fields the calculator still writes on every save/draft/duplicate
  -- (excel-calculator.tsx handleSaveQuote + handleSaveAsDraft). These were created in
  -- migrations 001/002 and made nullable in 012, but were dropped when consolidating
  -- into this file — their absence makes PostgREST reject every quote insert/update
  -- (PGRST204). Kept nullable to match migration 012, since the app does not always
  -- populate every margin.
  total_printing_cost NUMERIC,
  distance_traveled_km NUMERIC DEFAULT 0,
  margin_30 NUMERIC,
  margin_40 NUMERIC,
  margin_50 NUMERIC,
  margin_60 NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Optional normalized header/parts tables (used by the multi-part save path) ---
CREATE TABLE IF NOT EXISTS quote_headers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_type TEXT NOT NULL,
  quote_name TEXT,
  materials_cost DECIMAL(10, 2) DEFAULT 0,
  labor_cost DECIMAL(10, 2) DEFAULT 0,
  packaging_cost DECIMAL(10, 2) DEFAULT 0,
  shipping_cost DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quote_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_header_id UUID REFERENCES quote_headers(id) ON DELETE CASCADE,
  part_name TEXT NOT NULL,
  printer_id UUID REFERENCES printers(id),
  printer_name TEXT,
  printer_owner TEXT,
  filament_id UUID REFERENCES filaments(id),
  filament_name TEXT,
  filament_weight_grams DECIMAL(10, 2) NOT NULL,
  print_time_hours DECIMAL(10, 4) NOT NULL,
  emergency_fee DECIMAL(10, 2) DEFAULT 0,
  filament_cost DECIMAL(10, 2) NOT NULL,
  machine_cost DECIMAL(10, 2) NOT NULL,
  electricity_cost DECIMAL(10, 2) DEFAULT 0,
  dryer_cost DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- CSV import de-duplication (app reads/writes "imported_csv_files") -----------
CREATE TABLE IF NOT EXISTS imported_csv_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_hash TEXT UNIQUE NOT NULL,
  file_name TEXT NOT NULL,
  imported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  filament_count INTEGER
);

-- Indexes ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_quote_parts_header ON quote_parts(quote_header_id);
CREATE INDEX IF NOT EXISTS idx_quote_headers_type ON quote_headers(quote_type);
CREATE INDEX IF NOT EXISTS idx_quotes_client_id ON quotes(client_id);
CREATE INDEX IF NOT EXISTS idx_quotes_is_draft ON quotes(is_draft);
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);
CREATE INDEX IF NOT EXISTS idx_filaments_material_type ON filaments(material_type);
CREATE INDEX IF NOT EXISTS idx_laser_materials_type ON laser_materials(material_type);
CREATE INDEX IF NOT EXISTS idx_imported_csv_files_hash ON imported_csv_files(file_hash);
