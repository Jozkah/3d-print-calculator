-- Add heating fields to filaments table
ALTER TABLE filaments 
ADD COLUMN IF NOT EXISTS requires_heating BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS heating_time_hours DECIMAL(10, 2) DEFAULT 0;
