-- PARTNER SELF-SERVICE 1/8.
-- Intentionally fail if an existing resource has multiple active memberships:
-- never choose a manager or discard another partner's access implicitly.
-- Preflight before manual rollout:
-- SELECT resource_id,COUNT(*) active_count FROM partner_memberships
-- WHERE revoked_at IS NULL GROUP BY resource_id HAVING COUNT(*)>1;

CREATE UNIQUE INDEX `partner_memberships_one_active_resource`
  ON `partner_memberships` (`resource_id`) WHERE `revoked_at` IS NULL;

-- Preserve historic rows. Convert ONLY currently active legacy roles to
-- the single external manager role, with append-only role-change audit.
INSERT INTO partner_audit_events
  (id,actor_type,actor_ref,action,target_type,target_id,metadata_json,created_at)
SELECT lower(hex(randomblob(16))), 'SYSTEM', 'system:partner-0171',
  'MEMBERSHIP_ROLE_CHANGED', 'PARTNER_MEMBERSHIP', m.id,
  json_object('fromRole',m.role,'toRole','OWNER','reason','single_manager_0171'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM partner_memberships m
WHERE m.revoked_at IS NULL AND m.role<>'OWNER';

UPDATE partner_memberships
SET role='OWNER',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE revoked_at IS NULL AND role<>'OWNER';

-- Old revoked memberships retain historic roles, but newly active access
-- must always carry the one manager role.
CREATE TRIGGER `partner_memberships_only_owner_insert`
BEFORE INSERT ON `partner_memberships`
WHEN NEW.revoked_at IS NULL AND NEW.role<>'OWNER'
BEGIN
  SELECT RAISE(ABORT,'partner_memberships_only_owner');
END;

CREATE TRIGGER `partner_memberships_only_owner_update`
BEFORE UPDATE OF role,revoked_at ON `partner_memberships`
WHEN NEW.revoked_at IS NULL AND NEW.role<>'OWNER'
BEGIN
  SELECT RAISE(ABORT,'partner_memberships_only_owner');
END;
