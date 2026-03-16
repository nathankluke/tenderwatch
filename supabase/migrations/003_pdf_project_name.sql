-- Add project_name column to pdf_uploads for identification
ALTER TABLE pdf_uploads ADD COLUMN IF NOT EXISTS project_name text;
