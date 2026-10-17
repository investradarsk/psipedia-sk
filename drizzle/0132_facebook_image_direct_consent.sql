-- Prepared only: admin-owner-granted direct publication consent, default DENY.
-- Never apply without a separate, owner-approved production migration.
-- This does not create an external publication API or authorize a Meta POST.
ALTER TABLE facebook_image_posts ADD COLUMN direct_publish_consent INTEGER NOT NULL DEFAULT 0 CHECK (direct_publish_consent IN (0,1));
ALTER TABLE facebook_image_posts ADD COLUMN direct_consent_at TEXT;
ALTER TABLE facebook_image_posts ADD COLUMN direct_consent_by TEXT;
