import { createHash } from "node:crypto";

// Exact 0138 SQL bytes are immutable after owner-reviewed release approval.
export const PINNED_SHA256_0138 = "dcf846b1ade06ed4eff677bab288a4482869cc216d93bc375ab160e4499e28f0";
export const OBJECTS_0138 = Object.freeze({
  article_notion_editorial_outbox: "table",
  article_notion_editorial_outbox_updated_idx: "index",
  article_notion_editorial_outbox_lease_idx: "index",
});
const OUTBOX_COLUMNS = Object.freeze({
  notion_page_id: { type: "TEXT", pk: 1, notnull: 0 },
  article_id: { type: "INTEGER", pk: 0, notnull: 1 },
  article_updated_at: { type: "TEXT", pk: 0, notnull: 1 },
  base_content_hash: { type: "TEXT", pk: 0, notnull: 1 },
  operations_json: { type: "TEXT", pk: 0, notnull: 1 },
  lease_owner: { type: "TEXT", pk: 0, notnull: 0 },
  lease_until: { type: "TEXT", pk: 0, notnull: 0 },
  created_at: { type: "TEXT", pk: 0, notnull: 1 },
  updated_at: { type: "TEXT", pk: 0, notnull: 1 },
});

export function assertArticleOutbox0138Prerequisites(schema) {
  const objects = schema?.objects ?? [];
  for (const table of ["managed_articles", "article_notion_sync"])
    if (objects.filter(row => row.name === table && row.type === "table").length !== 1)
      throw Error("0138 missing canonical prerequisite: " + table);
  for (const name of ["notion_page_id", "article_id"])
    if (!(schema.articleNotionSyncColumns ?? []).some(row => row.name === name))
      throw Error("0138 missing Notion mapping column: " + name);
  if (!(schema.managedArticleColumns ?? []).some(row => row.name === "id"))
    throw Error("0138 missing canonical article id");
  return true;
}

export function assertArticleOutbox0138Schema(schema, sql) {
  if (createHash("sha256").update(sql).digest("hex") !== PINNED_SHA256_0138)
    throw Error("0138 migration SQL immutable digest mismatch");
  assertArticleOutbox0138Prerequisites(schema);
  const objects = schema?.objects ?? [];
  for (const [name, type] of Object.entries(OBJECTS_0138)) {
    const matching = objects.filter(row => row.name === name);
    if (matching.length !== 1 || matching[0].type !== type)
      throw Error("0138 missing or duplicated " + name);
  }
  const columns = schema?.articleNotionEditorialOutboxColumns ?? [];
  if (columns.length !== Object.keys(OUTBOX_COLUMNS).length)
    throw Error("0138 outbox column count changed");
  for (const [name, expected] of Object.entries(OUTBOX_COLUMNS)) {
    const matches = columns.filter(row => row.name === name);
    const row = matches[0];
    if (matches.length !== 1 || String(row.type).toUpperCase() !== expected.type ||
        Number(row.pk) !== expected.pk || Number(row.notnull) !== expected.notnull)
      throw Error("0138 outbox column contract changed: " + name);
  }

  const ddl = String(objects.find(row => row.name === "article_notion_editorial_outbox")?.sql ?? "");
  for (const required of [
    "notion_page_id TEXT PRIMARY KEY",
    "article_id INTEGER NOT NULL UNIQUE",
    "CHECK ((lease_owner IS NULL AND lease_until IS NULL)",
    "OR (lease_owner IS NOT NULL AND lease_until IS NOT NULL))",
    "FOREIGN KEY (notion_page_id) REFERENCES article_notion_sync(notion_page_id) ON DELETE CASCADE",
    "FOREIGN KEY (article_id) REFERENCES managed_articles(id) ON DELETE CASCADE",
  ]) if (!ddl.includes(required)) throw Error("0138 outbox constraint changed: " + required);

  const keys = schema?.articleNotionEditorialOutboxForeignKeys ?? [];
  if (keys.length !== 2) throw Error("0138 expected exactly two cascading foreign keys");
  for (const expected of [
    {table:"article_notion_sync",from:"notion_page_id",to:"notion_page_id"},
    {table:"managed_articles",from:"article_id",to:"id"},
  ]) {
    if (!keys.some(row => row.table === expected.table && row.from === expected.from &&
          row.to === expected.to && String(row.on_delete).toUpperCase() === "CASCADE"))
      throw Error("0138 missing cascading foreign key: " + expected.table);
  }
  for (const [name, column] of [
    ["article_notion_editorial_outbox_updated_idx","updated_at"],
    ["article_notion_editorial_outbox_lease_idx","lease_until"],
  ]) {
    const index = objects.find(row => row.name === name);
    if (index.tbl_name !== "article_notion_editorial_outbox" ||
        !String(index.sql ?? "").includes("(" + column + ")"))
      throw Error("0138 invalid outbox index: " + name);
  }
  return true;
}
