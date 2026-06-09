-- Create printers table
CREATE TABLE IF NOT EXISTS printers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  rate_per_hour DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create filaments table
CREATE TABLE IF NOT EXISTS filaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price_per_kg DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create quotes table
CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_type TEXT NOT NULL CHECK (quote_type IN ('personal', 'business')),
  part_name TEXT NOT NULL,
  printer_id UUID REFERENCES printers(id) ON DELETE SET NULL,
  printer_name TEXT NOT NULL,
  filament_id UUID REFERENCES filaments(id) ON DELETE SET NULL,
  filament_name TEXT NOT NULL,
  
  -- Input values
  material_weight_grams DECIMAL(10, 2) NOT NULL,
  print_time_hours DECIMAL(10, 2) NOT NULL,
  labor_cost DECIMAL(10, 2) NOT NULL DEFAULT 0,
  packaging_cost DECIMAL(10, 2) NOT NULL DEFAULT 0,
  emergency_fee DECIMAL(10, 2) NOT NULL DEFAULT 0,
  
  -- Calculated costs
  material_cost DECIMAL(10, 2) NOT NULL,
  machine_cost DECIMAL(10, 2) NOT NULL,
  total_printing_cost DECIMAL(10, 2) NOT NULL,
  landed_cost DECIMAL(10, 2) NOT NULL,
  
  -- Profit margins
  margin_30 DECIMAL(10, 2) NOT NULL,
  margin_40 DECIMAL(10, 2) NOT NULL,
  margin_50 DECIMAL(10, 2) NOT NULL,
  margin_60 DECIMAL(10, 2) NOT NULL,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default printers
INSERT INTO printers (name, rate_per_hour) VALUES
  ('Printer A', 2.50),
  ('Printer B', 3.00),
  ('Printer C', 2.00)
ON CONFLICT DO NOTHING;

-- Insert default filaments
INSERT INTO filaments (name, price_per_kg) VALUES
  ('PLA Black', 20.00),
  ('PLA White', 20.00),
  ('PETG', 25.00),
  ('ABS', 22.00)
ON CONFLICT DO NOTHING;
