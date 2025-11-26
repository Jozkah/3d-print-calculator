-- Add ownerA_receives and ownerB_receives columns to quotes table
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS ownerA_receives NUMERIC DEFAULT 0;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS ownerB_receives NUMERIC DEFAULT 0;
