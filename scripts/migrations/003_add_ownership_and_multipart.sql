-- Add owner field to printers
ALTER TABLE printers ADD COLUMN IF NOT EXISTS owner TEXT DEFAULT 'Owner B';

-- Update quotes table to support multiple parts
CREATE TABLE IF NOT EXISTS quote_headers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_type TEXT NOT NULL,
  quote_name TEXT,
  materials_cost DECIMAL(10, 2) DEFAULT 0,
  labor_cost DECIMAL(10, 2) DEFAULT 0,
  packaging_cost DECIMAL(10, 2) DEFAULT 0,
  shipping_cost DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT now()
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
  created_at TIMESTAMP DEFAULT now()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_quote_parts_header ON quote_parts(quote_header_id);
CREATE INDEX IF NOT EXISTS idx_quote_headers_type ON quote_headers(quote_type);
