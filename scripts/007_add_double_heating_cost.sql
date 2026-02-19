-- Add double_heating_cost setting to global_settings table
ALTER TABLE global_settings
ADD COLUMN IF NOT EXISTS double_heating_cost BOOLEAN DEFAULT TRUE;

-- Set default to TRUE (enabled) for existing rows
UPDATE global_settings SET double_heating_cost = TRUE WHERE double_heating_cost IS NULL;
