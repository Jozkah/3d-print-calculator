-- Remove dryer-related fields from printers table
ALTER TABLE printers DROP COLUMN IF EXISTS dryer_cost;
ALTER TABLE printers DROP COLUMN IF EXISTS estimated_dryer_uptime_percent;
ALTER TABLE printers DROP COLUMN IF EXISTS machine_type;
