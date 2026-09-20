CREATE TABLE `admin_push_subscriptions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `admin_email` text NOT NULL,
  `endpoint` text NOT NULL,
  `p256dh` text NOT NULL,
  `auth` text NOT NULL,
  `label` text,
  `platform` text,
  `enabled` integer DEFAULT 1 NOT NULL CHECK (`enabled` IN (0,1)),
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `last_seen_at` text NOT NULL
);
CREATE UNIQUE INDEX `admin_push_subscriptions_endpoint_unique`
  ON `admin_push_subscriptions` (`endpoint`);
CREATE INDEX `admin_push_subscriptions_admin_enabled_idx`
  ON `admin_push_subscriptions` (`admin_email`,`enabled`,`last_seen_at`);
CREATE INDEX `admin_push_subscriptions_last_seen_idx`
  ON `admin_push_subscriptions` (`last_seen_at`);

CREATE TABLE `admin_push_deliveries` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `notification_id` integer NOT NULL REFERENCES `editorial_notifications`(`id`) ON DELETE CASCADE,
  `subscription_id` integer NOT NULL REFERENCES `admin_push_subscriptions`(`id`) ON DELETE CASCADE,
  `status` text DEFAULT 'pending' NOT NULL CHECK (`status` IN ('pending','sent','failed','dead')),
  `attempts` integer DEFAULT 0 NOT NULL,
  `last_error` text,
  `sent_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
CREATE UNIQUE INDEX `admin_push_deliveries_notification_subscription_unique`
  ON `admin_push_deliveries` (`notification_id`,`subscription_id`);
CREATE INDEX `admin_push_deliveries_status_updated_idx`
  ON `admin_push_deliveries` (`status`,`updated_at`);
