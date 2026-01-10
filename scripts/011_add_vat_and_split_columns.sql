-- Add missing columns to quotes table for VAT toggle and split tracking
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS vat_enabled boolean DEFAULT true;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS quote_type_mode text;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS selected_margin_percentage numeric;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS custom_margin_value numeric;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS ownerA_machine_cost numeric;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS ownerB_machine_cost numeric;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS ownerA_electricity_cost numeric;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS ownerB_electricity_cost numeric;
