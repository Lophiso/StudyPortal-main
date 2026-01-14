-- Add metadata fields to JobOpportunity for higher-quality PhD ingestion and UI

ALTER TABLE "JobOpportunity"
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS funding_status text,
  ADD COLUMN IF NOT EXISTS full_title text;

UPDATE "JobOpportunity"
SET
  department = COALESCE(department, 'TBA'),
  funding_status = COALESCE(funding_status, 'TBA'),
  full_title = COALESCE(full_title, title);

UPDATE "JobOpportunity"
SET
  company = 'TBA'
WHERE company = 'Unknown';

UPDATE "JobOpportunity"
SET
  city = 'TBA'
WHERE city = 'Unknown';

UPDATE "JobOpportunity"
SET
  country = 'TBA'
WHERE country = 'Unknown';

ALTER TABLE "JobOpportunity"
  ALTER COLUMN department SET DEFAULT 'TBA',
  ALTER COLUMN department SET NOT NULL,
  ALTER COLUMN funding_status SET DEFAULT 'TBA',
  ALTER COLUMN funding_status SET NOT NULL,
  ALTER COLUMN full_title SET DEFAULT 'TBA',
  ALTER COLUMN full_title SET NOT NULL;
