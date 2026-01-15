-- Add card_summary for PhD listing snippet quality

ALTER TABLE "JobOpportunity"
  ADD COLUMN IF NOT EXISTS card_summary text;

UPDATE "JobOpportunity"
SET
  card_summary = COALESCE(card_summary, 'TBA');

ALTER TABLE "JobOpportunity"
  ALTER COLUMN card_summary SET DEFAULT 'TBA',
  ALTER COLUMN card_summary SET NOT NULL;
