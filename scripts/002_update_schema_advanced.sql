-- Drop existing tables to recreate with new structure
DROP TABLE IF EXISTS quotes CASCADE;
DROP TABLE IF EXISTS printers CASCADE;
DROP TABLE IF EXISTS filaments CASCADE;

-- Create global settings table
CREATE TABLE IF NOT EXISTS global_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  electricity_cost_per_kwh DECIMAL(10, 4) NOT NULL DEFAULT 0.20,
  fuel_cost_per_liter DECIMAL(10, 2) NOT NULL DEFAULT 2.00,
  car_fuel_consumption_per_100km DECIMAL(10, 2) NOT NULL DEFAULT 7.5,
  labor_hourly_rate DECIMAL(10, 2) NOT NULL DEFAULT 7.5,
  material_efficiency_factor DECIMAL(10, 2) NOT NULL DEFAULT 1.1,
  cost_buffer_factor DECIMAL(10, 2) NOT NULL DEFAULT 1.3,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default global settings
INSERT INTO global_settings (electricity_cost_per_kwh, fuel_cost_per_liter, car_fuel_consumption_per_100km, labor_hourly_rate)
VALUES (0.20, 2.00, 7.5, 7.5)
ON CONFLICT DO NOTHING;

-- Create printers table with advanced fields
CREATE TABLE IF NOT EXISTS printers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  
  -- Cost inputs
  printer_cost DECIMAL(10, 2) NOT NULL DEFAULT 500.00,
  dryer_cost DECIMAL(10, 2) NOT NULL DEFAULT 90.00,
  additional_upfront_cost DECIMAL(10, 2) NOT NULL DEFAULT 100.00,
  estimated_annual_maintenance DECIMAL(10, 2) NOT NULL DEFAULT 75.00,
  
  -- Lifetime and usage
  estimated_life_years DECIMAL(10, 2) NOT NULL DEFAULT 3.0,
  estimated_printer_uptime_percent DECIMAL(10, 4) NOT NULL DEFAULT 0.50,
  estimated_dryer_uptime_percent DECIMAL(10, 4) NOT NULL DEFAULT 0.10,
  
  -- Power consumption
  average_power_consumption_watts DECIMAL(10, 2) NOT NULL DEFAULT 150.00,
  
  -- Emergency fee
  fixed_emergency_fee DECIMAL(10, 2) NOT NULL DEFAULT 10.00,
  
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

-- Create line items tables
CREATE TABLE IF NOT EXISTS quote_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL,
  name TEXT NOT NULL,
  material TEXT NOT NULL,
  filament_grams DECIMAL(10, 2) NOT NULL,
  printing_time_hours DECIMAL(10, 2) NOT NULL,
  total_cost DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quote_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL,
  name TEXT NOT NULL,
  quantity DECIMAL(10, 2) NOT NULL,
  unit_cost DECIMAL(10, 2) NOT NULL,
  total_cost DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quote_packaging (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL,
  name TEXT NOT NULL,
  quantity DECIMAL(10, 2) NOT NULL,
  unit_cost DECIMAL(10, 2) NOT NULL,
  total_cost DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quote_labor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL,
  action TEXT NOT NULL,
  hours DECIMAL(10, 2) NOT NULL,
  hourly_cost DECIMAL(10, 2) NOT NULL,
  total_cost DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create quotes table with comprehensive fields
CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_type TEXT NOT NULL CHECK (quote_type IN ('personal', 'business')),
  part_name TEXT NOT NULL,
  printer_id UUID REFERENCES printers(id) ON DELETE SET NULL,
  printer_name TEXT NOT NULL,
  
  -- Calculated costs
  total_printing_cost DECIMAL(10, 2) NOT NULL,
  added_machine_cost DECIMAL(10, 2) NOT NULL,
  total_materials_cost DECIMAL(10, 2) NOT NULL,
  total_labor_cost DECIMAL(10, 2) NOT NULL,
  total_packaging_cost DECIMAL(10, 2) NOT NULL,
  added_fuel_cost DECIMAL(10, 2) NOT NULL,
  emergency_fee DECIMAL(10, 2) NOT NULL,
  landed_cost DECIMAL(10, 2) NOT NULL,
  
  -- Profit margins
  margin_30 DECIMAL(10, 2) NOT NULL,
  margin_40 DECIMAL(10, 2) NOT NULL,
  margin_50 DECIMAL(10, 2) NOT NULL,
  margin_60 DECIMAL(10, 2) NOT NULL,
  
  -- Additional fields
  distance_traveled_km DECIMAL(10, 2) DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default printers with Bambulab P1S as example
INSERT INTO printers (
  name, 
  printer_cost, 
  dryer_cost, 
  additional_upfront_cost, 
  estimated_annual_maintenance,
  estimated_life_years,
  estimated_printer_uptime_percent,
  estimated_dryer_uptime_percent,
  average_power_consumption_watts,
  fixed_emergency_fee
) VALUES
  ('Bambulab P1S', 500.00, 90.00, 100.00, 75.00, 3.0, 0.50, 0.10, 150.00, 10.00),
  ('Printer B', 800.00, 80.00, 50.00, 60.00, 4.0, 0.40, 0.08, 120.00, 8.00),
  ('Printer C', 600.00, 70.00, 30.00, 50.00, 3.5, 0.35, 0.07, 100.00, 5.00)
ON CONFLICT DO NOTHING;

-- Insert default filaments matching your Excel
INSERT INTO filaments (name, price_per_kg) VALUES
  ('ABS', 11.55),
  ('PETG', 15.28),
  ('PAHT-CF', 43.19),
  ('ASA', 20.99),
  ('PLA', 18.00),
  ('TPU', 25.00)
ON CONFLICT DO NOTHING;
