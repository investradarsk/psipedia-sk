CREATE TABLE `admin_bulk_selection_snapshots` (
  `id` text PRIMARY KEY NOT NULL,
  `module` text NOT NULL,
  `action` text NOT NULL,
  `selection_mode` text NOT NULL,
  `membership_filter_json` text NOT NULL,
  `filter_fingerprint` text NOT NULL,
  `actor_ref` text NOT NULL,
  `matched_count` integer NOT NULL,
  `created_at` text NOT NULL,
  `expires_at` text NOT NULL,
  CONSTRAINT `admin_bulk_selection_mode_check`
    CHECK (`selection_mode` IN ('explicit', 'all-matching'))
);

CREATE INDEX `admin_bulk_selection_snapshots_actor_created_idx`
  ON `admin_bulk_selection_snapshots` (`actor_ref`, `created_at`);

CREATE INDEX `admin_bulk_selection_snapshots_expires_idx`
  ON `admin_bulk_selection_snapshots` (`expires_at`);

CREATE TABLE `admin_bulk_selection_items` (
  `snapshot_id` text NOT NULL,
  `record_id` text NOT NULL,
  `exists_at_snapshot` integer NOT NULL DEFAULT 1,
  `captured_status` text,
  `captured_updated_at` text,
  `eligible` integer NOT NULL DEFAULT 0,
  `skip_reason` text,
  PRIMARY KEY (`snapshot_id`, `record_id`),
  FOREIGN KEY (`snapshot_id`) REFERENCES `admin_bulk_selection_snapshots`(`id`) ON DELETE CASCADE
);

CREATE INDEX `admin_bulk_selection_items_snapshot_idx`
  ON `admin_bulk_selection_items` (`snapshot_id`);
