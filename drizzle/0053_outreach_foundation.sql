CREATE TABLE outreach_campaigns (
  id text PRIMARY KEY NOT NULL,
  name text NOT NULL,
  purpose text DEFAULT 'PROFILE_VERIFICATION' NOT NULL
    CHECK (purpose IN ('PROFILE_VERIFICATION','DATA_QUALITY')),
  status text DEFAULT 'DRAFT' NOT NULL
    CHECK (status IN ('DRAFT','READY','SENDING','SENT','PAUSED','COMPLETED','CANCELLED')),
  selection_json text DEFAULT '{}' NOT NULL,
  subject_template text NOT NULL,
  body_template text NOT NULL,
  provider_key text DEFAULT '' NOT NULL,
  selected_entity_count integer DEFAULT 0 NOT NULL,
  unique_recipient_count integer DEFAULT 0 NOT NULL,
  deduplicated_count integer DEFAULT 0 NOT NULL,
  suppressed_count integer DEFAULT 0 NOT NULL,
  invalid_email_count integer DEFAULT 0 NOT NULL,
  previewed_at text,
  prepared_at text,
  scheduled_at text,
  send_started_at text,
  sent_at text,
  completed_at text,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  created_by text NOT NULL,
  updated_by text NOT NULL
);
CREATE INDEX outreach_campaigns_status_created_idx
  ON outreach_campaigns (status, created_at);

CREATE TABLE outreach_recipients (
  id text PRIMARY KEY NOT NULL,
  campaign_id text NOT NULL REFERENCES outreach_campaigns(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  normalized_email text NOT NULL,
  send_state text DEFAULT 'QUEUED' NOT NULL
    CHECK (send_state IN ('QUEUED','SENDING','SENT','DELIVERED','FAILED','BOUNCED','SUPPRESSED')),
  attempts integer DEFAULT 0 NOT NULL,
  last_attempt_at text,
  sent_at text,
  delivered_at text,
  bounced_at text,
  response_submitted_at text,
  provider_message_id text,
  last_error text,
  suppressed_reason text,
  created_at text NOT NULL,
  updated_at text NOT NULL
);
CREATE UNIQUE INDEX outreach_recipients_campaign_email_unique
  ON outreach_recipients (campaign_id, normalized_email);
CREATE INDEX outreach_recipients_campaign_state_idx
  ON outreach_recipients (campaign_id, send_state, created_at);
CREATE INDEX outreach_recipients_provider_message_idx
  ON outreach_recipients (provider_message_id);

CREATE TABLE outreach_recipient_entities (
  recipient_id text NOT NULL REFERENCES outreach_recipients(id) ON DELETE CASCADE,
  entity_type text NOT NULL
    CHECK (entity_type IN ('DIRECTORY_PROFILE','HELP_ORGANIZATION','MANAGED_EVENT','HELP_CASE')),
  entity_id text NOT NULL,
  entity_name text NOT NULL,
  profile_url text NOT NULL,
  region text NOT NULL DEFAULT '',
  public_snapshot_json text DEFAULT '{}' NOT NULL,
  PRIMARY KEY (recipient_id, entity_type, entity_id)
);
CREATE INDEX outreach_recipient_entities_entity_idx
  ON outreach_recipient_entities (entity_type, entity_id);

CREATE TABLE outreach_suppressions (
  normalized_email text PRIMARY KEY NOT NULL,
  reason text NOT NULL
    CHECK (reason IN ('UNSUBSCRIBE','HARD_BOUNCE','COMPLAINT','ADMIN')),
  source text NOT NULL,
  created_at text NOT NULL,
  created_by text
);
CREATE INDEX outreach_suppressions_reason_created_idx
  ON outreach_suppressions (reason, created_at);

CREATE TABLE outreach_claim_tokens (
  id text PRIMARY KEY NOT NULL,
  recipient_id text NOT NULL REFERENCES outreach_recipients(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('VERIFY','UNSUBSCRIBE')),
  token_hash text NOT NULL,
  expires_at text NOT NULL,
  used_at text,
  revoked_at text,
  created_at text NOT NULL
);
CREATE UNIQUE INDEX outreach_claim_tokens_hash_unique
  ON outreach_claim_tokens (token_hash);
CREATE INDEX outreach_claim_tokens_recipient_purpose_idx
  ON outreach_claim_tokens (recipient_id, purpose, expires_at);

CREATE TABLE outreach_delivery_events (
  provider_event_id text PRIMARY KEY NOT NULL,
  provider_key text NOT NULL,
  provider_message_id text,
  event_type text NOT NULL,
  payload_hash text NOT NULL,
  occurred_at text,
  received_at text NOT NULL
);
CREATE INDEX outreach_delivery_events_message_idx
  ON outreach_delivery_events (provider_message_id, received_at);
