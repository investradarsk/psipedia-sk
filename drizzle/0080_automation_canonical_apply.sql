-- G5: manual, field-level canonical apply audit for reviewed non-EVENT entity matches.
-- Additive only. No backfill, canonical writes, publication changes, source activation, or unattended apply.

CREATE TABLE automation_canonical_apply_operations (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  apply_fingerprint text NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('DIRECTORY','ORGANIZATION')),
  canonical_entity_id integer NOT NULL,
  source_cluster_id integer NOT NULL REFERENCES automation_entity_clusters(id) ON DELETE RESTRICT,
  target_cluster_id integer NOT NULL REFERENCES automation_entity_clusters(id) ON DELETE RESTRICT,
  observation_id integer NOT NULL REFERENCES automation_observations(id) ON DELETE RESTRICT,
  review_decision_id integer NOT NULL REFERENCES automation_entity_match_decisions(id) ON DELETE RESTRICT,
  review_decision_version integer NOT NULL CHECK (review_decision_version >= 1),
  evidence_fingerprint text NOT NULL,
  expected_canonical_updated_at text NOT NULL,
  selected_fields_json text NOT NULL,
  before_json text NOT NULL,
  after_json text NOT NULL,
  provenance_json text NOT NULL,
  status text NOT NULL CHECK (status IN ('SUCCESS','FAILED')),
  failure_code text,
  failure_detail text,
  applied_by text NOT NULL,
  applied_at text NOT NULL
);

CREATE UNIQUE INDEX automation_canonical_apply_operations_fingerprint_unique
  ON automation_canonical_apply_operations(apply_fingerprint);

CREATE INDEX automation_canonical_apply_operations_entity_idx
  ON automation_canonical_apply_operations(entity_type,canonical_entity_id,applied_at DESC,id DESC);

CREATE INDEX automation_canonical_apply_operations_review_idx
  ON automation_canonical_apply_operations(review_decision_id,applied_at DESC,id DESC);
