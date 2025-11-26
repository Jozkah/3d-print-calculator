-- Add machine_type column to distinguish printers from dryers
ALTER TABLE printers ADD COLUMN IF NOT EXISTS machine_type TEXT DEFAULT 'printer';

-- Update existing printers to be type 'printer'
UPDATE printers SET machine_type = 'printer' WHERE machine_type IS NULL;

-- Insert default dryers
INSERT INTO printers (name, owner, machine_type, printer_cost, dryer_cost, additional_upfront_cost, estimated_annual_maintenance, estimated_life_years, estimated_printer_uptime_percent, estimated_dryer_uptime_percent, average_power_consumption_watts)
VALUES 
  ('Sunlu S2', 'Owner B', 'dryer', 90.00, 0, 0, 10.00, 3.0, 0, 0.10, 200.00),
  ('Generic Dryer', 'Owner B', 'dryer', 90.00, 0, 0, 10.00, 3.0, 0, 0.10, 200.00)
ON CONFLICT DO NOTHING;
