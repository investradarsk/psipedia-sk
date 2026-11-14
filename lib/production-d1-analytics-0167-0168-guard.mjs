/**
 * Exact, standalone, schema-only rollout contracts for analytics 0167 and 0168.
 * Kept OUT of the automatic/sequential production migration target registry.
 * No data reads, visitor identities, destructive DDL, or ledger changes.
 */
export const ANALYTICS_D1_TARGETS = Object.freeze({
  "0167": Object.freeze({
    filename: "0167_content_analytics_profile_views.sql",
    gitBlobSha: "6f214d76c3940407f150f2a3fe8c51622d4abf82",
    objects: Object.freeze([
      "directory_profile_view_hourly",
      "directory_profile_view_hourly_window_idx",
      "content_qualified_views_hourly",
      "profile_view_rate_expiry_idx",
    ]),
    dependencies: Object.freeze([
      "d1_migrations", "directory_profiles", "article_read_hourly", "security_rate_limits",
    ]),
  }),
  "0168": Object.freeze({
    filename: "0168_sitewide_first_party_analytics.sql",
    gitBlobSha: "dd62381985dea0967ebc7c23dba161e34c427bfb",
    objects: Object.freeze([
      "site_analytics_hourly", "site_analytics_pages_hourly",
    ]),
    dependencies: Object.freeze(["d1_migrations"]),
  }),
});

const must = (condition, code) => {
  if (!condition) throw new Error("ANALYTICS_D1_" + code);
};

export function pinnedAnalyticsDdlStatements(sql) {
  const noComments = sql.split("\n")
    .filter(line => !line.trimStart().startsWith("--")).join("\n");
  const statements = noComments.split(";").map(value => value.trim()).filter(Boolean);
  must(statements.length > 0, "EMPTY_MIGRATION");
  for (const statement of statements)
    must(/^CREATE\s+(?:TABLE|INDEX|VIEW)\s+[a-z_][a-z0-9_]*\b/i.test(statement),
      "NON_ADDITIVE_DDL");
  return statements;
}

export function normalizeAnalyticsDdl(sql) {
  return String(sql ?? "").trim().replace(/;\s*$/, "").replace(/\s+/g, " ");
}

export function assertAnalyticsPinnedDdl(target, sql) {
  const config = ANALYTICS_D1_TARGETS[target];
  must(Boolean(config), "UNKNOWN_TARGET");
  const statements = pinnedAnalyticsDdlStatements(sql);
  const parsed = statements.map(statement => {
    const match = /^CREATE\s+(TABLE|INDEX|VIEW)\s+([a-z_][a-z0-9_]*)\b/i.exec(statement);
    must(Boolean(match), "UNEXPECTED_DDL");
    return { type: match[1].toLowerCase(), name: match[2], sql: normalizeAnalyticsDdl(statement) };
  });
  must(parsed.length === config.objects.length, "UNEXPECTED_DDL_COUNT");
  must(new Set(parsed.map(entry => entry.name)).size === parsed.length, "DUPLICATE_OBJECT");
  must(config.objects.every(name => parsed.some(entry => entry.name === name)), "UNEXPECTED_DDL_OBJECT");
  return parsed;
}

/**
 * Inspect SQLite catalog/ledger only; reject any partial or divergent install.
 * rows: SELECT type,name,sql FROM sqlite_master ...
 * historyNames: SELECT name FROM d1_migrations ...
 */
export function assertAnalyticsD1State({ target, sql, rows, historyNames }) {
  const config = ANALYTICS_D1_TARGETS[target];
  must(Boolean(config), "UNKNOWN_TARGET");
  must(Array.isArray(rows) && Array.isArray(historyNames), "INVALID_AUDIT");
  const expected = assertAnalyticsPinnedDdl(target, sql);
  const byName = new Map(rows.map(row => [row.name, row]));
  for (const name of config.dependencies)
    must(byName.get(name)?.type === "table", "DEPENDENCY_MISSING_" + name);
  must(historyNames.includes("0157_facebook_weekly_plan_marks.sql"),
    "LEDGER_0157_MISSING");
  const present = expected.filter(item => byName.has(item.name));
  must(present.length === 0 || present.length === expected.length, "PARTIAL_SCHEMA_REFUSED");
  for (const item of present) {
    const actual = byName.get(item.name);
    must(actual.type === item.type &&
      normalizeAnalyticsDdl(actual.sql) === item.sql,
    "INCOMPATIBLE_SCHEMA_" + item.name);
  }
  const installed = present.length === expected.length;
  must(installed || !historyNames.includes(config.filename),
    "LEDGER_CLAIMS_MISSING_SCHEMA");
  return { target, installed, readyToApply: !installed, objects: expected.map(item => item.name) };
}

export function assertAnalyticsDependencyColumns(target, byTable) {
  must(Boolean(ANALYTICS_D1_TARGETS[target]), "UNKNOWN_TARGET");
  if (target === "0168") return;
  const expected = {
    directory_profiles: ["id"],
    article_read_hourly: ["article_id", "bucket_hour", "qualified_reads"],
    security_rate_limits: ["bucket_key", "expires_at"],
  };
  for (const [table, columns] of Object.entries(expected)) {
    const present = new Set(byTable[table] ?? []);
    for (const column of columns)
      must(present.has(column), "DEPENDENCY_COLUMN_MISSING_" + table + "_" + column);
  }
}
