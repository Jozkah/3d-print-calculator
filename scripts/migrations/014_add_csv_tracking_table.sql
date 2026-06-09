-- Create table to track imported CSV files
CREATE TABLE IF NOT EXISTS csv_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_hash TEXT UNIQUE NOT NULL,
  file_name TEXT NOT NULL,
  imported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  filament_count INTEGER NOT NULL
);

-- Create index for faster duplicate detection
CREATE INDEX IF NOT EXISTS idx_csv_imports_hash ON csv_imports(file_hash);
