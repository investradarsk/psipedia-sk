-- G4: auditable human decisions for non-EVENT POSSIBLE entity matches.
-- Additive only. No backfill, canonical writes, publication changes, or source activation.

CREATE TABLE automation_entity_match_decisions (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  observation_id integer NOT NULL REFERENCES automation_observations(id) ON DELETE CASCADE,
  source_cluster_id integer NOT NULL REFERENCES automation_entity_clusters(id) ON DELETE CASCADE,
  candidate_cluster_id integer NOT NULL REFERENCES automation_entity_clusters(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('DIRECTORY','ORGANIZATION')),
  source_semantic_kind text NOT NULL,
  target_semantic_kind text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('SAME_ENTITY','DIFFERENT_ENTITY','RELATIONSHIP_ONLY','DEFER')),
  match_reason text NOT NULL,
  evidence_fingerprint text NOT NULL,
  evidence_snapshot_json text NOT NULL,
  reviewer text NOT NULL,
  note text,
  previous_decision_id integer REFERENCES automation_entity_match_decisions(id) ON DELETE SET NULL,
  decision_version integer DEFAULT 1 NOT NULL CHECK (decision_version >= 1),
  is_active integer DEFAULT 1 NOT NULL CHECK (is_active IN (0,1)),
  created_at text NOT NULL
);

CREATE UNIQUE INDEX automation_entity_match_decisions_active_pair_unique
  ON automation_entity_match_decisions(source_cluster_id,candidate_cluster_id)
  WHERE is_active=1;

CREATE INDEX automation_entity_match_decisions_pair_history_idx
  ON automation_entity_match_decisions(source_cluster_id,candidate_cluster_id,created_at DESC,id DESC);

CREATE INDEX automation_entity_match_decisions_review_idx
  ON automation_entity_match_decisions(entity_type,decision,is_active,created_at DESC);
