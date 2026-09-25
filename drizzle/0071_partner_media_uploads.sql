ALTER TABLE `moderation_submissions` ADD COLUMN `media_asset_id` text REFERENCES `media_assets`(`id`) ON DELETE RESTRICT;
CREATE UNIQUE INDEX `moderation_submissions_media_asset_unique`
  ON `moderation_submissions` (`media_asset_id`)
  WHERE `media_asset_id` IS NOT NULL;

CREATE TRIGGER `moderation_partner_media_attach_guard`
BEFORE INSERT ON `moderation_submissions`
WHEN NEW.`media_asset_id` IS NOT NULL
BEGIN
  SELECT CASE
    WHEN NEW.`submitter_type` <> 'PARTNER_ACCOUNT'
      THEN RAISE(ABORT, 'partner media requires Partner submission')
    WHEN NOT EXISTS (
      SELECT 1 FROM `media_assets` m
      WHERE m.`id` = NEW.`media_asset_id`
        AND m.`owner_id` = NEW.`submitter_ref`
        AND m.`state` = 'PENDING'
        AND m.`deleted_at` IS NULL
        AND m.`owner_type` = CASE
          WHEN NEW.`resource_type` IN ('DIRECTORY_PROFILE','HELP_ORGANIZATION') AND NEW.`operation`='CREATE'
            THEN 'PARTNER_PROFILE_CREATE'
          WHEN NEW.`resource_type` IN ('DIRECTORY_PROFILE','HELP_ORGANIZATION') AND NEW.`operation`='UPDATE'
            THEN 'PARTNER_PROFILE_UPDATE'
          WHEN NEW.`resource_type`='MANAGED_EVENT' AND NEW.`operation`='CREATE'
            THEN 'PARTNER_EVENT_CREATE'
          WHEN NEW.`resource_type`='MANAGED_EVENT' AND NEW.`operation`='UPDATE'
            THEN 'PARTNER_EVENT_UPDATE'
          ELSE '__INVALID__'
        END
    )
      THEN RAISE(ABORT, 'invalid partner media attachment')
  END;
END;

CREATE TRIGGER `moderation_partner_media_attach_state`
AFTER INSERT ON `moderation_submissions`
WHEN NEW.`media_asset_id` IS NOT NULL
BEGIN
  UPDATE `media_assets`
  SET `state`='ATTACHED'
  WHERE `id`=NEW.`media_asset_id` AND `state`='PENDING';
END;
