CREATE TABLE `admin_notification_runtime` (
  `id` integer PRIMARY KEY NOT NULL CHECK (`id` = 1),
  `rollout_started_at` text NOT NULL
);
INSERT INTO `admin_notification_runtime` (`id`, `rollout_started_at`)
VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ','now'));

CREATE TABLE `admin_notification_events` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `event_type` text NOT NULL,
  `source_type` text NOT NULL,
  `resource_type` text NOT NULL,
  `resource_ref` text NOT NULL,
  `actor_type` text NOT NULL,
  `actor_ref` text,
  `target_url` text NOT NULL CHECK (`target_url` = '/admin' OR `target_url` LIKE '/admin/%'),
  `title` text NOT NULL,
  `body` text NOT NULL,
  `tag` text NOT NULL,
  `dedupe_key` text NOT NULL,
  `created_at` text NOT NULL
);
CREATE UNIQUE INDEX `admin_notification_events_dedupe_unique`
  ON `admin_notification_events` (`dedupe_key`);
CREATE INDEX `admin_notification_events_created_idx`
  ON `admin_notification_events` (`created_at`);

CREATE TABLE `admin_push_event_deliveries` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `event_id` integer NOT NULL REFERENCES `admin_notification_events`(`id`) ON DELETE CASCADE,
  `subscription_id` integer NOT NULL REFERENCES `admin_push_subscriptions`(`id`) ON DELETE CASCADE,
  `status` text DEFAULT 'pending' NOT NULL CHECK (`status` IN ('pending','sent','failed','dead')),
  `attempts` integer DEFAULT 0 NOT NULL,
  `last_error` text,
  `sent_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
CREATE UNIQUE INDEX `admin_push_event_deliveries_event_subscription_unique`
  ON `admin_push_event_deliveries` (`event_id`,`subscription_id`);
CREATE INDEX `admin_push_event_deliveries_status_updated_idx`
  ON `admin_push_event_deliveries` (`status`,`updated_at`);
