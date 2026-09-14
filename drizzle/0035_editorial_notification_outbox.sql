CREATE TABLE `editorial_notifications` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `resource_type` text NOT NULL CHECK (`resource_type` IN ('directory_profile_change_request','news_tip','article_feedback')),
  `resource_id` integer NOT NULL,
  `notification_type` text NOT NULL CHECK (`notification_type` IN ('new')),
  `status` text DEFAULT 'pending' NOT NULL CHECK (`status` IN ('pending','sent','failed')),
  `attempts` integer DEFAULT 0 NOT NULL,
  `last_attempt_at` text,
  `sent_at` text,
  `last_error` text,
  `provider_message_id` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
CREATE UNIQUE INDEX `editorial_notifications_resource_type_unique`
  ON `editorial_notifications` (`resource_type`,`resource_id`,`notification_type`);
CREATE INDEX `editorial_notifications_status_updated_idx`
  ON `editorial_notifications` (`status`,`updated_at`);
