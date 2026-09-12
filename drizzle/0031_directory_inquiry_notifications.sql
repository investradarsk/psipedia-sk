ALTER TABLE `directory_inquiries` ADD COLUMN `submission_key` text;
CREATE UNIQUE INDEX `directory_inquiries_submission_key_unique` ON `directory_inquiries` (`submission_key`);

CREATE TABLE `directory_inquiry_notifications` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `inquiry_id` integer NOT NULL REFERENCES `directory_inquiries`(`id`) ON DELETE CASCADE,
  `notification_type` text NOT NULL CHECK (`notification_type` IN ('new','stale-24h')),
  `status` text DEFAULT 'pending' NOT NULL CHECK (`status` IN ('pending','sent','failed')),
  `attempts` integer DEFAULT 0 NOT NULL,
  `last_attempt_at` text,
  `sent_at` text,
  `last_error` text,
  `provider_message_id` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
CREATE UNIQUE INDEX `directory_inquiry_notifications_inquiry_type_unique`
  ON `directory_inquiry_notifications` (`inquiry_id`,`notification_type`);
CREATE INDEX `directory_inquiry_notifications_status_updated_idx`
  ON `directory_inquiry_notifications` (`status`,`updated_at`);
CREATE INDEX `directory_inquiry_notifications_inquiry_idx`
  ON `directory_inquiry_notifications` (`inquiry_id`,`created_at`);
