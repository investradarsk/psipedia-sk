-- OWNER-DISPATCHED ONLY. Apply BEFORE deploying relation readers.
-- This migration is additive. No trigger, JSON deletion or background backfill.
CREATE TABLE `directory_breeder_club_relations` (
  `station_profile_id` integer NOT NULL,
  `club_profile_id` integer NOT NULL,
  `created_at` text NOT NULL,
  `created_by` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `directory_breeder_club_relations_unique`
  ON `directory_breeder_club_relations` (`station_profile_id`,`club_profile_id`);
--> statement-breakpoint
CREATE INDEX `directory_breeder_club_relations_club_idx`
  ON `directory_breeder_club_relations` (`club_profile_id`,`station_profile_id`);
