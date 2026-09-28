export const canonicalResourceTypes = ["DIRECTORY_PROFILE", "HELP_ORGANIZATION", "MANAGED_EVENT"] as const;
export type CanonicalResourceType = (typeof canonicalResourceTypes)[number];
export const reviewableCanonicalResourceTypes = ["DIRECTORY_PROFILE", "HELP_ORGANIZATION"] as const;
export type ReviewableCanonicalResourceType = (typeof reviewableCanonicalResourceTypes)[number];

type ResourceStatement = {
  bind(...values: unknown[]): ResourceStatement;
  first<T>(): Promise<T | null>;
  run(): Promise<{ meta?: { changes?: number }; changes?: number } | unknown>;
};

export type CanonicalResourceDatabase = {
  prepare(sql: string): ResourceStatement;
};

type ResourceRow = {
  id: string;
  entityType: CanonicalResourceType;
  canonicalId: number;
};

const resourceSpecs: Record<CanonicalResourceType, {
  table: string;
  column: "directory_profile_id" | "help_organization_id" | "managed_event_id";
  idPrefix: string;
}> = {
  DIRECTORY_PROFILE: { table: "directory_profiles", column: "directory_profile_id", idPrefix: "directory-profile" },
  HELP_ORGANIZATION: { table: "help_organizations", column: "help_organization_id", idPrefix: "help-organization" },
  MANAGED_EVENT: { table: "managed_events", column: "managed_event_id", idPrefix: "managed-event" },
};

function positiveId(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Canonical resource ID must be a positive integer.");
  return value;
}

export function isCanonicalResourceType(value: unknown): value is CanonicalResourceType {
  return typeof value === "string" && (canonicalResourceTypes as readonly string[]).includes(value);
}

export function isReviewableCanonicalResourceType(value: unknown): value is ReviewableCanonicalResourceType {
  return typeof value === "string" && (reviewableCanonicalResourceTypes as readonly string[]).includes(value);
}

export function deterministicCanonicalResourceId(entityType: CanonicalResourceType, canonicalId: number) {
  return `${resourceSpecs[entityType].idPrefix}-${positiveId(canonicalId)}`;
}

function resourceSelect(spec: (typeof resourceSpecs)[CanonicalResourceType]) {
  return `SELECT id,entity_type AS entityType,${spec.column} AS canonicalId
    FROM partner_resources WHERE ${spec.column}=?1 LIMIT 1`;
}

export async function ensureCanonicalResource(input: {
  entityType: CanonicalResourceType;
  canonicalId: number;
  database: CanonicalResourceDatabase;
  now?: Date;
}): Promise<ResourceRow> {
  const canonicalId = positiveId(input.canonicalId);
  const spec = resourceSpecs[input.entityType];
  if (!spec) throw new Error("Unsupported canonical resource type.");

  const canonical = await input.database.prepare(`SELECT id FROM ${spec.table} WHERE id=?1 LIMIT 1`)
    .bind(canonicalId)
    .first<{ id: number }>();
  if (!canonical) throw new Error("Canonical resource does not exist.");

  const existing = await input.database.prepare(resourceSelect(spec))
    .bind(canonicalId)
    .first<ResourceRow>();
  if (existing) return existing;

  const now = (input.now ?? new Date()).toISOString();
  const deterministicId = deterministicCanonicalResourceId(input.entityType, canonicalId);
  await input.database.prepare(`INSERT OR IGNORE INTO partner_resources
      (id,entity_type,${spec.column},created_at,updated_at)
      VALUES (?1,?2,?3,?4,?4)`)
    .bind(deterministicId, input.entityType, canonicalId, now)
    .run();

  const resource = await input.database.prepare(resourceSelect(spec))
    .bind(canonicalId)
    .first<ResourceRow>();
  if (!resource) throw new Error("Canonical resource anchor could not be ensured.");
  return resource;
}

export function ensureResourceForDirectoryProfile(
  canonicalId: number,
  database: CanonicalResourceDatabase,
  now?: Date,
) {
  return ensureCanonicalResource({ entityType: "DIRECTORY_PROFILE", canonicalId, database, now });
}

export function ensureResourceForHelpOrganization(
  canonicalId: number,
  database: CanonicalResourceDatabase,
  now?: Date,
) {
  return ensureCanonicalResource({ entityType: "HELP_ORGANIZATION", canonicalId, database, now });
}

export function ensureResourceForManagedEvent(
  canonicalId: number,
  database: CanonicalResourceDatabase,
  now?: Date,
) {
  return ensureCanonicalResource({ entityType: "MANAGED_EVENT", canonicalId, database, now });
}

function changes(result: unknown) {
  if (!result || typeof result !== "object") return 0;
  const value = result as { meta?: { changes?: number }; changes?: number };
  return Number(value.meta?.changes ?? value.changes ?? 0);
}

export async function ensureReviewableResourceAnchors(
  database: CanonicalResourceDatabase,
  now = new Date(),
) {
  const timestamp = now.toISOString();
  const directory = await database.prepare(`INSERT OR IGNORE INTO partner_resources
      (id,entity_type,directory_profile_id,created_at,updated_at)
    SELECT 'directory-profile-' || d.id,'DIRECTORY_PROFILE',d.id,?1,?1
    FROM directory_profiles d
    WHERE NOT EXISTS (
      SELECT 1 FROM partner_resources r WHERE r.directory_profile_id=d.id
    )`).bind(timestamp).run();

  const organizations = await database.prepare(`INSERT OR IGNORE INTO partner_resources
      (id,entity_type,help_organization_id,created_at,updated_at)
    SELECT 'help-organization-' || o.id,'HELP_ORGANIZATION',o.id,?1,?1
    FROM help_organizations o
    WHERE NOT EXISTS (
      SELECT 1 FROM partner_resources r WHERE r.help_organization_id=o.id
    )`).bind(timestamp).run();

  return {
    directoryInserted: changes(directory),
    organizationInserted: changes(organizations),
  };
}
