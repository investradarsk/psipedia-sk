/**
 * Phase 1: a single production D1 inventory for directory (including e-shops
 * and Services V3), events and all five help agendas.
 *
 * Read-only by construction: schema discovery, grouped counts and orphan
 * link counts only. No PII, raw JSON, names, record IDs, D1 writes, Notion
 * calls, migrations or changes to the public/Admin source of truth.
 */
import { spawnSync } from "node:child_process";
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const DB_NAME = "psipedia-sk-db";
const DB_ID = "8f7a0c3e-4d77-4a35-8192-a7bd57147950";
const DIRECTORY_CATEGORIES = [
  "veterinari", "treneri", "kynologicke-kluby", "chovatelske-kluby",
  "chovatelske-stanice", "salony-a-sluzby", "hotely-a-opatrovanie",
  "vencenie", "fyzioterapia", "dalsie-sluzby",
  "psie-skoly", "utulky-a-zachrana",
];
const HELP_CATEGORIES = [
  "adopcia", "utulky", "docasna-opatera", "zbierky",
  "stratene-a-najdene", "dobrovolnictvo", "urgentne-pripady",
];
const EVENT_TYPES = ["Výstava", "Preteky", "Seminár", "Tréning", "Stretnutie", "Iné"];
const STATES = [
  "draft", "published", "archived", "DRAFT", "PUBLISHED", "ARCHIVED",
  "RESOLVED", "CLOSED", "ACTIVE", "INACTIVE", "CANCELLED",
];
const SCOPES = [
  { scope:"directory", table:"directory_profiles", kind:"directory",
    map:"directory_notion_sync", fk:"directory_profile_id", json:"source_data_json" },
  { scope:"eshops", table:"managed_eshops", kind:"eshops",
    map:"eshop_notion_sync", fk:"eshop_id" },
  { scope:"events", table:"managed_events", kind:"events",
    map:"event_notion_sync", fk:"event_id" },
  { scope:"help-cases", table:"help_cases", kind:"help",
    map:"notion_agenda_sync", fk:"entity_id", agenda:"help-cases" },
  { scope:"organizations", table:"help_organizations", kind:"organizations",
    map:"notion_agenda_sync", fk:"entity_id", agenda:"organizations", json:"source_data_json" },
  { scope:"adoptions", table:"adoption_dogs", kind:"adoptions",
    map:"notion_agenda_sync", fk:"entity_id", agenda:"adoptions" },
  { scope:"lost-found", table:"lost_found_dog_reports", kind:"lost-found",
    map:"notion_agenda_sync", fk:"entity_id", agenda:"lost-found" },
];
const SUPPORT = [
  "service_catalog_admin_options", "service_profile_option_choices",
  "service_profile_property_values", "directory_notion_sync",
  "eshop_notion_sync", "event_notion_sync", "notion_agenda_sync",
  "service_catalog_notion_auto_attempts",
];
const KNOWN_TABLES = [...new Set([...SCOPES.map(x => x.table), ...SUPPORT])];
const FORBIDDEN = /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|VACUUM|ATTACH|DETACH|PRAGMA|BEGIN|COMMIT|ROLLBACK|TRUNCATE)\b/i;

export function assertReadOnlySelect(sql) {
  if (typeof sql !== "string" || !/^SELECT\s/i.test(sql.trim()) ||
    !sql.trimEnd().endsWith(";") || (sql.match(/;/g) ?? []).length !== 1 ||
    /--|\/\*/.test(sql) || FORBIDDEN.test(sql)) {
    throw new Error("EDITORIAL_STORAGE_AUDIT_NON_READONLY_SQL");
  }
  return sql;
}

const literals = values => values.map(x => "'" + x.replaceAll("'", "''") + "'").join(", ");
const knownValue = (expression, values) =>
  "CASE WHEN " + expression + " IN (" + literals(values) + ") THEN " +
  expression + " ELSE 'other' END";

export function buildTableDiscoverySql() {
  return assertReadOnlySelect("SELECT name FROM sqlite_master WHERE type='table' AND name IN (" +
    literals(KNOWN_TABLES) + ") ORDER BY name;");
}

function groupExpression(spec) {
  if (spec.kind === "directory") return knownValue("t.category", DIRECTORY_CATEGORIES);
  if (spec.kind === "events") return knownValue("t.event_type", EVENT_TYPES);
  if (spec.kind === "help") return knownValue("t.category", HELP_CATEGORIES);
  if (spec.kind === "lost-found") return knownValue("t.type", ["LOST","FOUND","lost","found"]);
  if (spec.kind === "organizations") return "'organizations'";
  return "'" + spec.scope + "'";
}

/**
 * A missing sync mapping table must produce NULL (unknown), NOT zero.
 * A mapping row proves linkage only, not that Notion is available or equal.
 */
export function buildScopeCountSql(spec, existing) {
  if (!KNOWN_TABLES.includes(spec.table) || !existing.has(spec.table)) return null;
  const mapped = existing.has(spec.map)
    ? "SUM(CASE WHEN EXISTS (SELECT 1 FROM " + spec.map +
      " m WHERE m." + spec.fk + "=t.id" +
      (spec.agenda ? " AND m.agenda='" + spec.agenda + "'" : "") +
      ") THEN 1 ELSE 0 END)"
    : "NULL";
  const source = spec.json ? "t." + spec.json : null;
  const legacy = source
    ? "SUM(CASE WHEN json_valid(" + source + ") AND TRIM(" + source +
      ") NOT IN ('','{}') THEN 1 ELSE 0 END)"
    : "NULL";
  const invalid = source
    ? "SUM(CASE WHEN NOT json_valid(" + source + ") THEN 1 ELSE 0 END)"
    : "NULL";
  const technical = spec.kind === "directory"
    ? "SUM(CASE WHEN EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(" +
      source + ") THEN " + source + " ELSE '{}' END) j " +
      "WHERE substr(j.key,1,9)='_psipedia') THEN 1 ELSE 0 END)"
    : "NULL";
  return assertReadOnlySelect(
    "SELECT '" + spec.scope + "' AS scope, " + groupExpression(spec) +
    " AS category, " + knownValue("t.status", STATES) + " AS state, " +
    "COUNT(*) AS records, " + mapped + " AS notion_mapped, " +
    legacy + " AS nonempty_source_json, " + invalid + " AS invalid_source_json, " +
    technical + " AS technical_json_dependencies " +
    "FROM " + spec.table + " t GROUP BY 2,3 ORDER BY 2,3;"
  );
}

export function buildOrphanMapSql(spec, existing) {
  if (!existing.has(spec.table) || !existing.has(spec.map)) return null;
  return assertReadOnlySelect(
    "SELECT COUNT(*) AS orphans FROM " + spec.map + " m WHERE " +
    (spec.agenda ? "m.agenda='" + spec.agenda + "' AND " : "") +
    "NOT EXISTS (SELECT 1 FROM " + spec.table + " t WHERE t.id=m." + spec.fk + ");"
  );
}

export function planAudit(existing) {
  const tables = new Set(existing);
  return {
    scopes: SCOPES.map(spec => ({spec,
      sql:buildScopeCountSql(spec,tables),
      orphanSql:buildOrphanMapSql(spec,tables)})),
    supporting: SUPPORT.filter(name => tables.has(name)),
    missing: KNOWN_TABLES.filter(name => !tables.has(name)),
  };
}

function extractWranglerRows(output) {
  let parsed;
  try { parsed = JSON.parse(output.trim()); }
  catch { throw new Error("EDITORIAL_STORAGE_AUDIT_INVALID_D1_RESPONSE"); }
  const batches = Array.isArray(parsed) ? parsed : [parsed];
  if (!batches.length || batches.some(batch => batch?.success !== true ||
      !Array.isArray(batch.results))) {
    throw new Error("EDITORIAL_STORAGE_AUDIT_D1_QUERY_FAILED");
  }
  return batches.flatMap(batch => batch.results);
}

function query(sql, configPath) {
  assertReadOnlySelect(sql);
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const run = spawnSync(npx, ["--no-install","wrangler","d1","execute",DB_NAME,
    "--remote","--config",configPath,"--json","--command",sql], {
    cwd:ROOT,encoding:"utf8",maxBuffer:8*1024*1024,
    env:{...process.env,WRANGLER_SEND_METRICS:"false",NO_UPDATE_NOTIFIER:"1"},
  });
  if (run.error || run.status !== 0)
    throw new Error("EDITORIAL_STORAGE_AUDIT_REMOTE_READ_FAILED");
  return extractWranglerRows(run.stdout);
}

export const ORGANIZATION_ORPHAN_LIMIT = 100;

/** Export exact orphan mappings for manual reconciliation, never modify them.
 * This is a *second* audit: aggregate count must match before the artifact
 * can be trusted. Page IDs are private audit artifact content, not job logs.
 */
export function buildOrganizationOrphanDetailsSql() {
  return assertReadOnlySelect(
    "SELECT m.entity_id, m.notion_page_id, m.last_synced_at " +
    "FROM notion_agenda_sync m WHERE m.agenda='organizations' " +
    "AND NOT EXISTS (SELECT 1 FROM help_organizations o WHERE o.id=m.entity_id) " +
    "ORDER BY m.entity_id, m.notion_page_id LIMIT 101;"
  );
}

export function validateOrganizationOrphanDetails(rows, expectedCount) {
  if (!Array.isArray(rows) || !Number.isSafeInteger(expectedCount) ||
      expectedCount<0 || expectedCount>ORGANIZATION_ORPHAN_LIMIT ||
      rows.length!==expectedCount) {
    throw new Error("ORGANIZATION_ORPHANS_AGGREGATE_MISMATCH");
  }
  const ids=new Set(), pages=new Set();
  return rows.map(row=>{
    const entityId=row?.entity_id, pageId=row?.notion_page_id;
    if (!Number.isSafeInteger(entityId) || entityId<=0 ||
        typeof pageId!=="string" ||
        !/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(pageId) ||
        (row.last_synced_at!==null && typeof row.last_synced_at!=="string") ||
        ids.has(entityId) || pages.has(pageId)) {
      throw new Error("ORGANIZATION_ORPHANS_INVALID_MAPPING");
    }
    ids.add(entityId);pages.add(pageId);
    return {entityId,notionPageId:pageId,lastSyncedAt:row.last_synced_at};
  });
}


/** Read-only tombstone/guard evidence for precisely the same orphan cohort. */
export function buildOrganizationOrphanLifecycleSql() {
  return assertReadOnlySelect(
    "SELECT m.entity_id, m.notion_page_id, " +
    "t.record_id AS tombstone_record_id, t.notion_page_id AS tombstone_page_id, " +
    "t.record_slug AS tombstone_slug, t.state AS tombstone_state, " +
    "t.error_code AS tombstone_error, t.completed_at AS tombstone_completed_at, " +
    "g.remote_state AS publication_guard_state, g.error_code AS publication_guard_error " +
    "FROM notion_agenda_sync m " +
    "LEFT JOIN admin_record_tombstones t ON t.kind='organizations' AND " +
    "(t.record_id=m.entity_id OR (t.notion_page_id IS NOT NULL AND " +
    "replace(lower(t.notion_page_id),'-','')=replace(lower(m.notion_page_id),'-',''))) " +
    "LEFT JOIN admin_record_publication_guards g " +
    "ON g.kind='organizations' AND g.record_id=m.entity_id " +
    "WHERE m.agenda='organizations' AND NOT EXISTS " +
    "(SELECT 1 FROM help_organizations o WHERE o.id=m.entity_id) " +
    "ORDER BY m.entity_id, m.notion_page_id LIMIT 101;"
  );
}

export function validateOrganizationOrphanLifecycle(rows, expected) {
  const uuid=value=>String(value).replaceAll("-","").toLowerCase();
  const states=new Set(["PENDING_NOTION","ERROR_NOTION","READY_LOCAL","COMPLETE"]);
  const guardStates=new Set(["PENDING","SYNCED","UNLINKED","NOT_APPLICABLE"]);
  if (!Array.isArray(rows) || !Array.isArray(expected) ||
      rows.length!==expected.length || rows.length>ORGANIZATION_ORPHAN_LIMIT)
    throw Error("ORGANIZATION_ORPHAN_LIFECYCLE_COUNT_DRIFT");
  return rows.map((r,i)=>{
    const e=expected[i];
    if(!r || !e || r.entity_id!==e.entityId ||
       uuid(r.notion_page_id)!==uuid(e.notionPageId))
      throw Error("ORGANIZATION_ORPHAN_LIFECYCLE_IDENTITY_DRIFT");
    const hasTombstone=r.tombstone_record_id!==null;
    if(hasTombstone && (!Number.isSafeInteger(r.tombstone_record_id) ||
      r.tombstone_record_id<=0 || !states.has(r.tombstone_state) ||
      typeof r.tombstone_slug!=="string" || !r.tombstone_slug.trim()))
      throw Error("ORGANIZATION_ORPHAN_LIFECYCLE_INVALID_TOMBSTONE");
    if(!hasTombstone && [r.tombstone_page_id,r.tombstone_slug,
      r.tombstone_state,r.tombstone_error,r.tombstone_completed_at]
      .some(value=>value!==null))
      throw Error("ORGANIZATION_ORPHAN_LIFECYCLE_INVALID_TOMBSTONE");
    if(r.publication_guard_state!==null && !guardStates.has(r.publication_guard_state))
      throw Error("ORGANIZATION_ORPHAN_LIFECYCLE_INVALID_GUARD");
    const pageConflict=hasTombstone && r.tombstone_page_id!==null &&
      uuid(r.tombstone_page_id)!==uuid(r.notion_page_id);
    return {
      entityId:e.entityId,notionPageId:e.notionPageId,
      tombstonePresent:hasTombstone,
      tombstoneRecordId:r.tombstone_record_id,
      tombstonePageId:r.tombstone_page_id,
      tombstoneSlug:r.tombstone_slug,
      tombstoneState:r.tombstone_state,
      tombstoneError:r.tombstone_error,
      tombstoneCompletedAt:r.tombstone_completed_at,
      publicationGuardState:r.publication_guard_state,
      publicationGuardError:r.publication_guard_error,
      tombstoneIdentityConflict:hasTombstone &&
        (r.tombstone_record_id!==e.entityId || pageConflict),
    };
  });
}

function naturalCount(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value : null;
}
function normalizeCounts(rows, spec) {
  const groupValues = new Set([
    "other", spec.scope, "organizations", "adoptions", "eshops",
    ...DIRECTORY_CATEGORIES,...HELP_CATEGORIES,...EVENT_TYPES,
    "LOST","FOUND","lost","found",
  ]);
  const allowedStates = new Set([...STATES,"other"]);
  return rows.map(row => {
    if (row.scope !== spec.scope || !groupValues.has(row.category) ||
      !allowedStates.has(row.state) || naturalCount(row.records) === null)
      throw new Error("EDITORIAL_STORAGE_AUDIT_UNEXPECTED_GROUP");
    for (const key of ["notion_mapped","nonempty_source_json",
      "invalid_source_json","technical_json_dependencies"]) {
      if (row[key] !== null && naturalCount(row[key]) === null)
        throw new Error("EDITORIAL_STORAGE_AUDIT_INVALID_AGGREGATE");
    }
    if (row.notion_mapped !== null && row.notion_mapped > row.records)
      throw new Error("EDITORIAL_STORAGE_AUDIT_MAPPING_EXCEEDS_ROWS");
    return {
      scope:row.scope,category:row.category,state:row.state,
      records:row.records,notionMapped:row.notion_mapped,
      nonemptySourceJson:row.nonempty_source_json,
      invalidSourceJson:row.invalid_source_json,
      technicalJsonDependencies:row.technical_json_dependencies,
    };
  });
}

async function main() {
  const config = JSON.parse(await readFile(join(ROOT,"config/cloudflare-resources.json"),"utf8"));
  if (config.account_id !== process.env.CLOUDFLARE_ACCOUNT_ID ||
      config.d1?.database_name !== DB_NAME || config.d1?.database_id !== DB_ID ||
      config.d1?.binding !== "DB" || !process.env.CLOUDFLARE_API_TOKEN)
    throw new Error("EDITORIAL_STORAGE_AUDIT_WRONG_TARGET_OR_MISSING_TOKEN");
  const temporary = await mkdtemp(join(tmpdir(),"psipedia-editorial-readonly-"));
  const outputDir = join(ROOT,".production-editorial-storage-readonly");
  try {
    const wranglerConfig = join(temporary,"wrangler.json");
    await writeFile(wranglerConfig,JSON.stringify({
      name:"psipedia-editorial-storage-readonly",
      compatibility_date:"2026-08-23",
      d1_databases:[{binding:"DB",database_name:DB_NAME,database_id:DB_ID}],
    }));
    const discovery = query(buildTableDiscoverySql(),wranglerConfig);
    if (discovery.some(row => !KNOWN_TABLES.includes(row.name)))
      throw new Error("EDITORIAL_STORAGE_AUDIT_UNEXPECTED_SCHEMA");
    const existing = new Set(discovery.map(x => x.name));
    const plan = planAudit(existing);
    const groups = [];
    const orphans = [];
    for (const item of plan.scopes) {
      if (!item.sql) continue;
      groups.push(...normalizeCounts(query(item.sql,wranglerConfig),item.spec));
      if (item.orphanSql) {
        const data = query(item.orphanSql,wranglerConfig);
        if (data.length !== 1 || naturalCount(data[0].orphans) === null)
          throw new Error("EDITORIAL_STORAGE_AUDIT_UNEXPECTED_ORPHANS");
        orphans.push({scope:item.spec.scope,count:data[0].orphans});
      }
    }
    const supportCounts = [];
    for (const table of plan.supporting) {
      const data = query(assertReadOnlySelect("SELECT COUNT(*) AS records FROM " + table + ";"),wranglerConfig);
      if (data.length !== 1 || naturalCount(data[0].records) === null)
        throw new Error("EDITORIAL_STORAGE_AUDIT_UNEXPECTED_SUPPORT_COUNT");
      supportCounts.push({table,records:data[0].records});
    }
    const organizationOrphanCount = orphans.find(row=>row.scope==="organizations")?.count;
    if (organizationOrphanCount === undefined)
      throw new Error("ORGANIZATION_ORPHANS_COUNT_MISSING");
    if (organizationOrphanCount > ORGANIZATION_ORPHAN_LIMIT)
      throw new Error("ORGANIZATION_ORPHANS_REVIEW_LIMIT_EXCEEDED");
    const organizationOrphanDetails=validateOrganizationOrphanDetails(
      query(buildOrganizationOrphanDetailsSql(),wranglerConfig),
      organizationOrphanCount,
    );
    // These stable IDs and sync timestamps stay in a private Actions artifact.
    // Do not log them or write them back into the canonical D1/Notion source.
    await mkdir(outputDir,{recursive:true});
    await writeFile(join(outputDir,"organization-orphans.json"),JSON.stringify({
      database:DB_NAME,readOnly:true,expectedCount:organizationOrphanCount,
      records:organizationOrphanDetails,
    },null,2)+"\n");
    // Look up deletion evidence without changing either D1 or Notion.
    // These tables were installed by the protected 0164 lifecycle migration.
    const lifecycleTables=query(assertReadOnlySelect(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN " +
      "('admin_record_tombstones','admin_record_publication_guards') ORDER BY name;"
    ),wranglerConfig);
    if (lifecycleTables.length!==2 ||
        lifecycleTables[0]?.name!=="admin_record_publication_guards" ||
        lifecycleTables[1]?.name!=="admin_record_tombstones")
      throw Error("ORGANIZATION_ORPHAN_LIFECYCLE_TABLES_UNAVAILABLE");
    const orphanLifecycle=validateOrganizationOrphanLifecycle(
      query(buildOrganizationOrphanLifecycleSql(),wranglerConfig),
      organizationOrphanDetails,
    );
    await writeFile(join(outputDir,"organization-orphan-lifecycle.json"),JSON.stringify({
      database:DB_NAME,readOnly:true,
      // A tombstone is historical evidence, not authorization to delete.
      warning:"Review tombstone state and Notion page before any mutation.",
      records:orphanLifecycle,
    },null,2)+"\n");
    const report = {
      executedAt:new Date().toISOString(),gitRevision:process.env.GITHUB_SHA??null,
      database:DB_NAME,readOnly:true,
      scope:"directory, eshops, help (5 agendas), events, service catalog V3",
      missingTables:plan.missing,supportCounts,orphanMappings:orphans,byCategory:groups,
      notes:[
        "Notion mapping count is not proof of synchronized field values or enabled runtime.",
        "Missing mapping table yields notionMapped=null; it is NOT an assertion of zero links.",
        "Nonempty source JSON may contain active technical values; never delete it based on this count.",
        "This report does not compare Notion property values, Admin output or public pages.",
        "No production data was changed; no migration or cleanup was performed.",
      ],
    };
    await mkdir(outputDir,{recursive:true});
    await writeFile(join(outputDir,"report.json"),JSON.stringify(report,null,2)+"\n");
    const summary = [
      "### Psipedia — Services / Help / Events D1 readiness",
      "",
      "| Section | Records | Notion-linked* | Source JSON rows |",
      "| --- | ---: | ---: | ---: |",
      ...SCOPES.map(spec => {
        const items=groups.filter(row=>row.scope===spec.scope);
        const total=items.reduce((n,row)=>n+row.records,0);
        const linked=items.every(row=>row.notionMapped!==null)
          ? items.reduce((n,row)=>n+row.notionMapped,0) : "unknown";
        const json=items.every(row=>row.nonemptySourceJson!==null)
          ? items.reduce((n,row)=>n+row.nonemptySourceJson,0) : "n/a";
        return "| "+spec.scope+" | "+(existing.has(spec.table)?total:"missing")+
          " | "+linked+" | "+json+" |";
      }),
      "",
      "*A mapping is not proof of live Notion parity. No D1 writes were made.",
      "Missing supporting tables: "+(plan.missing.join(", ")||"none"),
      "Download report.json to inspect each category and orphan mapping counts.",
    ];
    if (process.env.GITHUB_STEP_SUMMARY)
      await appendFile(process.env.GITHUB_STEP_SUMMARY,summary.join("\n")+"\n");
    process.stdout.write(JSON.stringify({result:"READ_ONLY_COMPLETE",scopes:SCOPES.length,
      groups:groups.length,missing:plan.missing.length})+"\n");
  } finally {
    await rm(temporary,{recursive:true,force:true});
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : "EDITORIAL_STORAGE_AUDIT_FAILED");
    process.exitCode=1;
  });
}
