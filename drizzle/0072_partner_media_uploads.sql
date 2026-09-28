ALTER TABLE `moderation_submissions` ADD COLUMN `media_asset_id` text REFERENCES `media_assets`(`id`) ON DELETE RESTRICT;
CREATE UNIQUE INDEX `moderation_submissions_media_asset_unique`
  ON `moderation_submissions` (`media_asset_id`)
  WHERE `media_asset_id` IS NOT NULL;

CREATE TRIGGER `moderation_partner_media_submitter_guard`
BEFORE INSERT ON `moderation_submissions`
WHEN NEW.`media_asset_id` IS NOT NULL
  AND NEW.`submitter_type` <> 'PARTNER_ACCOUNT'
BEGIN
  SELECT RAISE(ABORT, 'partner media requires Partner submission');
END;

CREATE TRIGGER `moderation_partner_media_attach_guard`
BEFORE INSERT ON `moderation_submissions`
WHEN NEW.`media_asset_id` IS NOT NULL
  AND NEW.`submitter_type` = 'PARTNER_ACCOUNT'
  AND NOT EXISTS (
    SELECT 1 FROM `media_assets` m
    WHERE m.`id` = NEW.`media_asset_id`
      AND m.`owner_id` = NEW.`submitter_ref`
      AND m.`state` = 'PENDING'
      AND m.`deleted_at` IS NULL
      AND (
        (NEW.`resource_type` IN ('DIRECTORY_PROFILE','HELP_ORGANIZATION')
          AND NEW.`operation`='CREATE'
          AND m.`owner_type`='PARTNER_PROFILE_CREATE')
        OR
        (NEW.`resource_type` IN ('DIRECTORY_PROFILE','HELP_ORGANIZATION')
          AND NEW.`operation`='UPDATE'
          AND m.`owner_type`='PARTNER_PROFILE_UPDATE')
        OR
        (NEW.`resource_type`='MANAGED_EVENT'
          AND NEW.`operation`='CREATE'
          AND m.`owner_type`='PARTNER_EVENT_CREATE')
        OR
        (NEW.`resource_type`='MANAGED_EVENT'
          AND NEW.`operation`='UPDATE'
          AND m.`owner_type`='PARTNER_EVENT_UPDATE')
      )
  )
BEGIN
  SELECT RAISE(ABORT, 'invalid partner media attachment');
END;

CREATE TRIGGER `moderation_partner_media_attach_state`
AFTER INSERT ON `moderation_submissions`
WHEN NEW.`media_asset_id` IS NOT NULL
BEGIN
  UPDATE `media_assets`
  SET `state`='ATTACHED'
  WHERE `id`=NEW.`media_asset_id` AND `state`='PENDING';
END;
