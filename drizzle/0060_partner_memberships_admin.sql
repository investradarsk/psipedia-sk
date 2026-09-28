CREATE TABLE `partner_resources` (
  `id` text PRIMARY KEY NOT NULL,
  `entity_type` text NOT NULL CHECK (`entity_type` IN ('DIRECTORY_PROFILE','HELP_ORGANIZATION','MANAGED_EVENT')),
  `directory_profile_id` integer REFERENCES `directory_profiles`(`id`) ON DELETE RESTRICT,
  `help_organization_id` integer REFERENCES `help_organizations`(`id`) ON DELETE RESTRICT,
  `managed_event_id` integer REFERENCES `managed_events`(`id`) ON DELETE RESTRICT,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  CHECK (
    (`entity_type`='DIRECTORY_PROFILE' AND `directory_profile_id` IS NOT NULL AND `help_organization_id` IS NULL AND `managed_event_id` IS NULL) OR
    (`entity_type`='HELP_ORGANIZATION' AND `directory_profile_id` IS NULL AND `help_organization_id` IS NOT NULL AND `managed_event_id` IS NULL) OR
    (`entity_type`='MANAGED_EVENT' AND `directory_profile_id` IS NULL AND `help_organization_id` IS NULL AND `managed_event_id` IS NOT NULL)
  )
);
CREATE UNIQUE INDEX `partner_resources_directory_unique` ON `partner_resources` (`directory_profile_id`) WHERE `directory_profile_id` IS NOT NULL;
CREATE UNIQUE INDEX `partner_resources_organization_unique` ON `partner_resources` (`help_organization_id`) WHERE `help_organization_id` IS NOT NULL;
CREATE UNIQUE INDEX `partner_resources_event_unique` ON `partner_resources` (`managed_event_id`) WHERE `managed_event_id` IS NOT NULL;
CREATE INDEX `partner_resources_type_updated_idx` ON `partner_resources` (`entity_type`,`updated_at`);

CREATE TABLE `partner_memberships` (
  `id` text PRIMARY KEY NOT NULL,
  `account_id` text NOT NULL REFERENCES `partner_accounts`(`id`) ON DELETE RESTRICT,
  `resource_id` text NOT NULL REFERENCES `partner_resources`(`id`) ON DELETE RESTRICT,
  `role` text NOT NULL CHECK (`role` IN ('OWNER','MANAGER','EDITOR')),
  `created_at` text NOT NULL,
  `created_by` text NOT NULL,
  `updated_at` text NOT NULL,
  `revoked_at` text,
  `revoked_by` text
);
CREATE UNIQUE INDEX `partner_memberships_active_unique` ON `partner_memberships` (`account_id`,`resource_id`) WHERE `revoked_at` IS NULL;
CREATE INDEX `partner_memberships_account_active_idx` ON `partner_memberships` (`account_id`,`revoked_at`,`updated_at`);
CREATE INDEX `partner_memberships_resource_active_idx` ON `partner_memberships` (`resource_id`,`revoked_at`,`updated_at`);

CREATE TABLE `partner_audit_events` (
  `id` text PRIMARY KEY NOT NULL,
  `actor_type` text NOT NULL CHECK (`actor_type` IN ('PARTNER','ADMIN','SYSTEM')),
  `actor_ref` text NOT NULL,
  `action` text NOT NULL CHECK (`action` IN ('ACCOUNT_CREATED','EMAIL_VERIFIED','ACCOUNT_SUSPENDED','ACCOUNT_REACTIVATED','ACCOUNT_DEACTIVATED','SESSIONS_REVOKED','MEMBERSHIP_CREATED','MEMBERSHIP_ROLE_CHANGED','MEMBERSHIP_REVOKED')),
  `target_type` text NOT NULL,
  `target_id` text NOT NULL,
  `metadata_json` text NOT NULL DEFAULT '{}',
  `created_at` text NOT NULL
);
CREATE INDEX `partner_audit_target_created_idx` ON `partner_audit_events` (`target_type`,`target_id`,`created_at`);
CREATE INDEX `partner_audit_actor_created_idx` ON `partner_audit_events` (`actor_type`,`actor_ref`,`created_at`);
CREATE TRIGGER `partner_audit_events_no_update` BEFORE UPDATE ON `partner_audit_events` BEGIN SELECT RAISE(ABORT, 'partner_audit_events is append-only'); END;
CREATE TRIGGER `partner_audit_events_no_delete` BEFORE DELETE ON `partner_audit_events` BEGIN SELECT RAISE(ABORT, 'partner_audit_events is append-only'); END;
