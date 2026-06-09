-- Add status column to quotes table for tracking order status
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

-- Add comment to describe valid status values
COMMENT ON COLUMN quotes.status IS 'Order status: pending, in_progress, shipping, finished, canceled, invalid';
