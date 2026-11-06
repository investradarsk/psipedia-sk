-- EDITOR-10: Optional public organizer contact and admission fee (additive).
-- Existing records remain unchanged; use the approved D1 migration workflow.
ALTER TABLE managed_events ADD COLUMN contact_phone TEXT;
ALTER TABLE managed_events ADD COLUMN contact_email TEXT;
ALTER TABLE managed_events ADD COLUMN admission_fee TEXT NOT NULL DEFAULT '';
