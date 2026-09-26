CREATE TABLE `automation_governance_reviews` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `subject_type` text NOT NULL CHECK (`subject_type` IN ('DISCOVERY_ROOT','AUTOMATION_SOURCE')),
  `subject_id` integer NOT NULL CHECK (`subject_id` > 0),
  `access_status` text DEFAULT 'UNKNOWN' NOT NULL CHECK (`access_status` IN ('UNKNOWN','ALLOWED','RESTRICTED','BLOCKED')),
  `robots_status` text DEFAULT 'UNKNOWN' NOT NULL CHECK (`robots_status` IN ('UNKNOWN','ALLOWED','RESTRICTED','DISALLOWED','NOT_APPLICABLE')),
  `terms_status` text DEFAULT 'UNKNOWN' NOT NULL CHECK (`terms_status` IN ('UNKNOWN','ALLOWED','REQUIRES_REVIEW','RESTRICTED','BLOCKED')),
  `recurring_status` text DEFAULT 'UNKNOWN' NOT NULL CHECK (`recurring_status` IN ('UNKNOWN','APPROVED','RESTRICTED','DENIED')),
  `retention_status` text DEFAULT 'UNKNOWN' NOT NULL CHECK (`retention_status` IN ('UNKNOWN','APPROVED','RESTRICTED','DENIED')),
  `retain_url` integer DEFAULT 0 NOT NULL CHECK (`retain_url` IN (0,1)),
  `retain_title` integer DEFAULT 0 NOT NULL CHECK (`retain_title` IN (0,1)),
  `retain_snippet` integer DEFAULT 0 NOT NULL CHECK (`retain_snippet` IN (0,1)),
  `retain_metadata` integer DEFAULT 0 NOT NULL CHECK (`retain_metadata` IN (0,1)),
  `retention_days` integer CHECK (`retention_days` IS NULL OR (`retention_days` BETWEEN 1 AND 3650)),
  `min_cadence_minutes` integer CHECK (`min_cadence_minutes` IS NULL OR (`min_cadence_minutes` BETWEEN 60 AND 43200)),
  `max_requests_per_day` integer CHECK (`max_requests_per_day` IS NULL OR (`max_requests_per_day` BETWEEN 1 AND 100000)),
  `manual_only` integer DEFAULT 0 NOT NULL CHECK (`manual_only` IN (0,1)),
  `path_scope` text,
  `restrictions_note` text,
  `terms_url` text,
  `privacy_url` text,
  `robots_url` text,
  `evidence_url` text,
  `reviewed_at` text NOT NULL,
  `reviewed_by` text NOT NULL,
  `rationale` text NOT NULL,
  `expires_at` text,
  `review_due_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
CREATE UNIQUE INDEX `automation_governance_reviews_subject_unique`
  ON `automation_governance_reviews` (`subject_type`,`subject_id`);
CREATE INDEX `automation_governance_reviews_review_due_idx`
  ON `automation_governance_reviews` (`review_due_at`,`expires_at`);

CREATE TABLE `automation_governance_review_history` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `review_id` integer NOT NULL REFERENCES `automation_governance_reviews`(`id`) ON DELETE RESTRICT,
  `subject_type` text NOT NULL CHECK (`subject_type` IN ('DISCOVERY_ROOT','AUTOMATION_SOURCE')),
  `subject_id` integer NOT NULL CHECK (`subject_id` > 0),
  `before_json` text,
  `after_json` text NOT NULL,
  `actor` text NOT NULL,
  `rationale` text NOT NULL,
  `changed_at` text NOT NULL
);
CREATE INDEX `automation_governance_review_history_subject_idx`
  ON `automation_governance_review_history` (`subject_type`,`subject_id`,`changed_at`);

CREATE TRIGGER `automation_governance_reviews_history_insert`
AFTER INSERT ON `automation_governance_reviews`
BEGIN
  INSERT INTO `automation_governance_review_history`
    (`review_id`,`subject_type`,`subject_id`,`before_json`,`after_json`,`actor`,`rationale`,`changed_at`)
  VALUES (
    NEW.id,NEW.subject_type,NEW.subject_id,NULL,
    json_object(
      'access_status',NEW.access_status,'robots_status',NEW.robots_status,'terms_status',NEW.terms_status,
      'recurring_status',NEW.recurring_status,'retention_status',NEW.retention_status,
      'retain_url',NEW.retain_url,'retain_title',NEW.retain_title,'retain_snippet',NEW.retain_snippet,'retain_metadata',NEW.retain_metadata,
      'retention_days',NEW.retention_days,'min_cadence_minutes',NEW.min_cadence_minutes,'max_requests_per_day',NEW.max_requests_per_day,
      'manual_only',NEW.manual_only,'path_scope',NEW.path_scope,'restrictions_note',NEW.restrictions_note,
      'terms_url',NEW.terms_url,'privacy_url',NEW.privacy_url,'robots_url',NEW.robots_url,'evidence_url',NEW.evidence_url,
      'expires_at',NEW.expires_at,'review_due_at',NEW.review_due_at
    ),
    NEW.reviewed_by,NEW.rationale,NEW.updated_at
  );
END;

CREATE TRIGGER `automation_governance_reviews_history_update`
AFTER UPDATE ON `automation_governance_reviews`
BEGIN
  INSERT INTO `automation_governance_review_history`
    (`review_id`,`subject_type`,`subject_id`,`before_json`,`after_json`,`actor`,`rationale`,`changed_at`)
  VALUES (
    NEW.id,NEW.subject_type,NEW.subject_id,
    json_object(
      'access_status',OLD.access_status,'robots_status',OLD.robots_status,'terms_status',OLD.terms_status,
      'recurring_status',OLD.recurring_status,'retention_status',OLD.retention_status,
      'retain_url',OLD.retain_url,'retain_title',OLD.retain_title,'retain_snippet',OLD.retain_snippet,'retain_metadata',OLD.retain_metadata,
      'retention_days',OLD.retention_days,'min_cadence_minutes',OLD.min_cadence_minutes,'max_requests_per_day',OLD.max_requests_per_day,
      'manual_only',OLD.manual_only,'path_scope',OLD.path_scope,'restrictions_note',OLD.restrictions_note,
      'terms_url',OLD.terms_url,'privacy_url',OLD.privacy_url,'robots_url',OLD.robots_url,'evidence_url',OLD.evidence_url,
      'expires_at',OLD.expires_at,'review_due_at',OLD.review_due_at
    ),
    json_object(
      'access_status',NEW.access_status,'robots_status',NEW.robots_status,'terms_status',NEW.terms_status,
      'recurring_status',NEW.recurring_status,'retention_status',NEW.retention_status,
      'retain_url',NEW.retain_url,'retain_title',NEW.retain_title,'retain_snippet',NEW.retain_snippet,'retain_metadata',NEW.retain_metadata,
      'retention_days',NEW.retention_days,'min_cadence_minutes',NEW.min_cadence_minutes,'max_requests_per_day',NEW.max_requests_per_day,
      'manual_only',NEW.manual_only,'path_scope',NEW.path_scope,'restrictions_note',NEW.restrictions_note,
      'terms_url',NEW.terms_url,'privacy_url',NEW.privacy_url,'robots_url',NEW.robots_url,'evidence_url',NEW.evidence_url,
      'expires_at',NEW.expires_at,'review_due_at',NEW.review_due_at
    ),
    NEW.reviewed_by,NEW.rationale,NEW.updated_at
  );
END;

CREATE TRIGGER `automation_governance_review_history_no_update`
BEFORE UPDATE ON `automation_governance_review_history`
BEGIN SELECT RAISE(ABORT, 'automation governance history is immutable'); END;

CREATE TRIGGER `automation_governance_review_history_no_delete`
BEFORE DELETE ON `automation_governance_review_history`
BEGIN SELECT RAISE(ABORT, 'automation governance history is immutable'); END;
