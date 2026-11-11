-- 0165: Explicitly public contact fields for lost/found dog reports.
-- Admin editor controls publication. NEVER copy private encrypted PII into these columns.
-- Apply manually to production D1 before enabling the editor inputs; merge is not APPLY.
ALTER TABLE lost_found_dog_reports ADD COLUMN public_phone TEXT NOT NULL DEFAULT '';
ALTER TABLE lost_found_dog_reports ADD COLUMN public_email TEXT NOT NULL DEFAULT '';
ALTER TABLE lost_found_dog_reports ADD COLUMN public_website_url TEXT NOT NULL DEFAULT '';
ALTER TABLE lost_found_dog_reports ADD COLUMN public_facebook_url TEXT NOT NULL DEFAULT '';
ALTER TABLE lost_found_dog_reports ADD COLUMN public_instagram_url TEXT NOT NULL DEFAULT '';
