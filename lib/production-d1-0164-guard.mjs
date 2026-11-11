/**
 * Exact, read-only preflight contract for manually applied D1 migration 0164.
 * All object names below are static; never interpolate a user-supplied table.
 */
export const LIFECYCLE_0164_FILE = "0164_admin_record_lifecycle.sql";
export const LIFECYCLE_0164_SQL_BLOB = "18c155a955c0089bff11e3291d63a73dc6ab9097";
export const LIFECYCLE_0164_SOURCES = Object.freeze({
  directory: { table: "directory_profiles", extra: ["import_key"] },
  events: { table: "managed_events", extra: [] },
  help: { table: "help_cases", extra: [] },
  breeds: { table: "managed_breeds", extra: ["fci_number"] },
  articles: { table: "managed_articles", extra: [] },
  adoptions: { table: "adoption_dogs", extra: [] },
  "lost-found": { table: "lost_found_dog_reports", extra: [] },
  organizations: { table: "help_organizations", extra: ["import_key"] },
});
export const LIFECYCLE_0164_TABLES = Object.freeze([
  "admin_record_tombstones", "admin_record_publication_guards",
]);
export const LIFECYCLE_0164_INDEXES = Object.freeze([
  "admin_record_tombstones_state_idx",
  "admin_record_tombstones_slug_idx",
  "admin_record_tombstones_external_idx",
]);
const triggerSuffix = Object.freeze({
  "lost-found": "lost_found",
});
export const LIFECYCLE_0164_TRIGGERS = Object.freeze(
  Object.entries(LIFECYCLE_0164_SOURCES).flatMap(([kind]) => {
    const suffix = triggerSuffix[kind] ?? kind;
    return [
      "admin_deleted_" + suffix + "_insert",
      "admin_removing_" + suffix + "_update",
      "admin_guarded_" + suffix + "_delete",
    ];
  }),
);
export const LIFECYCLE_0164_OBJECTS = Object.freeze([
  ...LIFECYCLE_0164_TABLES, ...LIFECYCLE_0164_INDEXES, ...LIFECYCLE_0164_TRIGGERS,
]);
const tombstoneFields = [
  "kind", "record_id", "record_slug", "record_external_key", "record_name",
  "record_category", "notion_page_id", "notion_data_source_id",
  "notion_targets_json", "state", "error_code", "attempts", "created_by",
  "created_at", "updated_at", "completed_at",
];
const publicationFields = ["kind", "record_id", "remote_state", "error_code", "updated_at"];
const allColumns = Object.freeze({
  admin_record_tombstones: tombstoneFields,
  admin_record_publication_guards: publicationFields,
});
const norm = (value) => String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const must = (condition, code) => { if (!condition) throw Error(code); };

function checkInstalledObjects(objects, columns) {
  const byName = new Map(objects.map((obj) => [obj.name, obj]));
  for (const name of LIFECYCLE_0164_TABLES) {
    const obj = byName.get(name);
    must(obj?.type === "table" && norm(obj.sql).includes("create table"),
      "LIFECYCLE_0164_TABLE_SIGNATURE_INVALID_" + name);
    const actual = columns[name] ?? [];
    const fields = allColumns[name];
    must(actual.length === fields.length && fields.every((field) => actual.some((x) => x.name === field)),
      "LIFECYCLE_0164_TABLE_COLUMNS_INVALID_" + name);
    must(actual.find((x) => x.name === "kind")?.pk === 1 &&
      actual.find((x) => x.name === "record_id")?.pk === 2,
      "LIFECYCLE_0164_PRIMARY_KEY_INVALID_" + name);
    const ddl = norm(obj.sql);
    must(ddl.includes("primary key") && ddl.includes("check") && ddl.includes("kind"),
      "LIFECYCLE_0164_CONSTRAINT_INVALID_" + name);
  }
  const indexColumns = {
    admin_record_tombstones_state_idx: "state, updated_at",
    admin_record_tombstones_slug_idx: "kind, record_slug",
    admin_record_tombstones_external_idx: "kind,record_external_key",
  };
  for (const name of LIFECYCLE_0164_INDEXES) {
    const obj = byName.get(name);
    const ddl = norm(obj?.sql);
    must(obj?.type === "index" && obj?.tbl_name === "admin_record_tombstones" &&
      ddl.includes("on admin_record_tombstones") &&
      ddl.replace(/\s+/g, "").includes("(" + indexColumns[name].replace(/\s+/g, "") + ")"),
      "LIFECYCLE_0164_INDEX_INVALID_" + name);
  }
  for (const [kind, spec] of Object.entries(LIFECYCLE_0164_SOURCES)) {
    const suffix = triggerSuffix[kind] ?? kind;
    for (const [prefix, event, abortCode] of [
      ["admin_deleted_", "before insert on", "RECORD_TOMBSTONED"],
      ["admin_removing_", "before update of status, slug on", "RECORD_REMOVAL_PENDING"],
      ["admin_guarded_", "before delete on", "USE_VERIFIED_LIFECYCLE_DELETE"],
    ]) {
      const tail = prefix === "admin_deleted_" ? "_insert" :
        prefix === "admin_removing_" ? "_update" : "_delete";
      const name = prefix + suffix + tail;
      const obj = byName.get(name);
      const ddl = norm(obj?.sql);
      must(obj?.type === "trigger" && obj?.tbl_name === spec.table &&
        ddl.includes(event + " " + spec.table) &&
        ddl.includes("raise(abort") && ddl.includes(abortCode.toLowerCase()),
        "LIFECYCLE_0164_TRIGGER_INVALID_" + name);
    }
  }
}

export function classifyLifecycle0164({ objects = [], columns = {}, counts = {}, ledgerCount = null }) {
  const byName = new Map(objects.map((obj) => [obj.name, obj]));
  const blockers = [];
  for (const [kind, source] of Object.entries(LIFECYCLE_0164_SOURCES)) {
    if (byName.get(source.table)?.type !== "table") {
      blockers.push("MISSING_SOURCE_TABLE:" + source.table);
      continue;
    }
    const available = new Set((columns[source.table] ?? []).map((x) => x.name));
    for (const field of ["id", "slug", "status", ...source.extra]) {
      if (!available.has(field)) blockers.push("MISSING_COLUMN:" + source.table + "." + field);
    }
    if (counts[source.table] !== undefined &&
      (!Number.isSafeInteger(counts[source.table]) || counts[source.table] < 0))
      blockers.push("INVALID_COUNT:" + kind);
  }
  const present = LIFECYCLE_0164_OBJECTS.filter((name) => byName.has(name));
  const partial = present.length > 0 && present.length !== LIFECYCLE_0164_OBJECTS.length;
  if (partial) blockers.push("PARTIAL_LIFECYCLE_SCHEMA:" + present.length +
    "/" + LIFECYCLE_0164_OBJECTS.length);
  if (present.length === LIFECYCLE_0164_OBJECTS.length) {
    try { checkInstalledObjects(objects, columns); }
    catch (error) { blockers.push(error instanceof Error ? error.message : "INVALID_SCHEMA"); }
  }
  if (ledgerCount !== null &&
    (!Number.isSafeInteger(ledgerCount) || ledgerCount < 0))
    blockers.push("INVALID_MIGRATION_LEDGER");
  const installed = present.length === LIFECYCLE_0164_OBJECTS.length &&
    !blockers.some((x) => /LIFECYCLE_0164_|PARTIAL_LIFECYCLE/.test(x));
  return {
    installed, readyToApply: !installed && blockers.length === 0,
    presentObjects: present.length, expectedObjects: LIFECYCLE_0164_OBJECTS.length,
    sourceCounts: counts, ledgerCount, blockers,
  };
}
export function assertLifecycle0164ApplyReady(state) {
  must(state.readyToApply && !state.installed && state.blockers.length === 0,
    "LIFECYCLE_0164_PREREQUISITES_NOT_READY:" + state.blockers.join(","));
  return true;
}
export function assertLifecycle0164Postflight(before, after) {
  must(after.installed && after.blockers.length === 0 &&
    after.presentObjects === LIFECYCLE_0164_OBJECTS.length,
    "LIFECYCLE_0164_POSTFLIGHT_SCHEMA_INCOMPLETE");
  must(after.ledgerCount === before.ledgerCount,
    "LIFECYCLE_0164_MIGRATION_LEDGER_CHANGED");
  return true;
}
