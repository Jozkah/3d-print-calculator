-- Add missing columns to quotes table
ALTER TABLE quotes
ADD COLUMN IF NOT EXISTS quote_name text,
ADD COLUMN IF NOT EXISTS printed_parts jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS dried_batches jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS materials jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS labor_items jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS packaging_items jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS is_emergency boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS machine_cost numeric,
ADD COLUMN IF NOT EXISTS drying_cost numeric,
ADD COLUMN IF NOT EXISTS materials_cost numeric,
ADD COLUMN IF NOT EXISTS labor_cost numeric,
ADD COLUMN IF NOT EXISTS packaging_cost numeric,
ADD COLUMN IF NOT EXISTS fuel_cost numeric,
ADD COLUMN IF NOT EXISTS electricity_cost numeric,
ADD COLUMN IF NOT EXISTS selected_margin text;
