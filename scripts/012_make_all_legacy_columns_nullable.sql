-- Make all legacy single-part quote columns nullable
-- These are no longer used with the new JSONB multi-part structure

ALTER TABLE quotes
  ALTER COLUMN added_machine_cost DROP NOT NULL,
  ALTER COLUMN total_printing_cost DROP NOT NULL,
  ALTER COLUMN total_materials_cost DROP NOT NULL,
  ALTER COLUMN total_labor_cost DROP NOT NULL,
  ALTER COLUMN total_packaging_cost DROP NOT NULL,
  ALTER COLUMN added_fuel_cost DROP NOT NULL,
  ALTER COLUMN emergency_fee DROP NOT NULL,
  ALTER COLUMN landed_cost DROP NOT NULL,
  ALTER COLUMN margin_30 DROP NOT NULL,
  ALTER COLUMN margin_40 DROP NOT NULL,
  ALTER COLUMN margin_50 DROP NOT NULL,
  ALTER COLUMN margin_60 DROP NOT NULL,
  ALTER COLUMN packaging_cost DROP NOT NULL,
  ALTER COLUMN labor_cost DROP NOT NULL,
  ALTER COLUMN materials_cost DROP NOT NULL,
  ALTER COLUMN electricity_cost DROP NOT NULL,
  ALTER COLUMN fuel_cost DROP NOT NULL,
  ALTER COLUMN drying_cost DROP NOT NULL,
  ALTER COLUMN machine_cost DROP NOT NULL;
