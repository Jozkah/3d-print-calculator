-- Add owner field to printers and move emergency fee to global settings

-- Add owner column to printers table
ALTER TABLE printers 
ADD COLUMN IF NOT EXISTS owner VARCHAR(50) DEFAULT 'Owner B';

-- Remove emergency fee from printers (it's now global)
ALTER TABLE printers 
DROP COLUMN IF EXISTS fixed_emergency_fee;

-- Add emergency fee to global settings
ALTER TABLE global_settings
ADD COLUMN IF NOT EXISTS emergency_fee_fixed DECIMAL(10, 2) DEFAULT 10.00;

-- Update existing printers with owners
UPDATE printers SET owner = 'Owner A' WHERE name LIKE '%Owner A%';
UPDATE printers SET owner = 'Owner B' WHERE name NOT LIKE '%Owner A%';
