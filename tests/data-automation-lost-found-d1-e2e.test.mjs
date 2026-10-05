import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  createAutomationSourceAdmin,
  getAutomationSourceAdmin,
  reviewAutomationSource,
  setAutomationSourceEnabled,
} from "../lib/data-automation-source-store.ts";
import { upsertGovernanceReview } from "../lib/data-automation-governance.ts";
import { runAutomationSourceNow } from "../lib/data-automation-runner.ts";
import { productionAutomationHtmlAdapters } from "../lib/data-automation-real-sources.ts";

const SOURCE_ROOT = "https://lost-found-e2e.example/reports";
const DETAIL_URL = SOURCE_ROOT + "/rex";
const RESOLVED_URL = SOURCE_ROOT + "/bella";
const DOG_NAME = "Rex E2E LostFound";
const RESOLVED_NAME = "Bella E2E LostFound";
const FIXED_NOW = new Date("2026-10-05T12:00:00.000Z");

function d1Database(filename) {
  const sqlite = new DatabaseSync(filename);
  sqlite.exec("PRAGMA foreign_keys = ON");

  class Prepared {
    constructor(sql) {
      this.sql = sql;
      this.values = [];
    }
    bind(...values) {
      const next = new Prepared(this.sql);
      next.values = values.map((value) => value === undefined ? null : value);
      return next;
    }
    first(column) {
      const row = sqlite.prepare(this.sql).get(...this.values) ?? null;
      if (!row || !column) return row;
      return row[column] ?? null;
    }
    all() {
      const results = sqlite.prepare(this.sql).all(...this.values);
      return { success: true, results, meta: { changes: 0 } };
    }
    run() {
      const result = sqlite.prepare(this.sql).run(...this.values);
      return {
        success: true,
        meta: {
          changes: Number(result.changes ?? 0),
          last_row_id: Number(result.lastInsertRowid ?? 0),
          lastRowId: Number(result.lastInsertRowid ?? 0),
        },
      };
    }
    raw() {
      return sqlite.prepare(this.sql).all(...this.values).map((row) => Object.values(row));
    }
  }

  return {
    prepare(sql) {
      return new Prepared(sql);
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const output = statements.map((statement) => statement.run());
        sqlite.exec("COMMIT");
        return output;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
    async exec(sql) {
      sqlite.exec(sql);
      return { count: 0, duration: 0 };
    },
    _sqlite: sqlite,
  };
}

function page(html) {
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-length": String(Buffer.byteLength(html)),
    },
  });
}

const LISTING = `<!doctype html>
<html lang="sk">
  <body>
    <h1>Stratené a nájdené psy</h1>
    <article class="lost-found-card"><a class="dog-name" href="/reports/rex">${DOG_NAME}</a></article>
    <article class="lost-found-card"><a class="dog-name" href="/reports/bella">${RESOLVED_NAME}</a></article>
  </body>
</html>`;

const DETAIL = `<!doctype html>
<html lang="sk">
  <head>
    <link rel="canonical" href="${DETAIL_URL}">
    <meta name="description" content="Nájdený pes v Nitre.">
  </head>
  <body>
    <h1>Nájdený pes ${DOG_NAME}</h1>
    <p>Nájdený pes</p>
    <p>Meno: ${DOG_NAME}</p>
    <p>Dátum nálezu: 05.10.2026</p>
    <p>Mesto: Nitra</p>
    <p>Okres: Nitra</p>
    <p>Kraj: Nitriansky kraj</p>
    <p>Lokalita: Chrenová</p>
    <p>Pohlavie: pes</p>
    <p>Plemeno: Labrador</p>
    <p>Farba: čierna</p>
    <p>Veľkosť: veľký</p>
  </body>
</html>`;

const RESOLVED_DETAIL = `<!doctype html>
<html lang="sk">
  <head>
    <link rel="canonical" href="${RESOLVED_URL}">
    <meta name="description" content="Nájdená fenka, prípad je vyriešený.">
  </head>
  <body>
    <h1>Nájdená fenka ${RESOLVED_NAME}</h1>
    <p>Nájdená fenka</p>
    <p>Meno: ${RESOLVED_NAME}</p>
    <p>Dátum nálezu: 05.10.2026</p>
    <p>Mesto: Nitra</p>
    <p>Pohlavie: fenka</p>
    <p>Plemeno: kríženec</p>
    <p>Farba: hnedá</p>
    <p>Stav: pes je doma</p>
  </body>
</html>`;

function fetchImpl(input) {
  const url = typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
  const parsed = new URL(url);
  if (parsed.origin !== "https://lost-found-e2e.example") {
    throw new Error("unexpected_e2e_fetch_origin:" + parsed.origin);
  }
  if (parsed.pathname === "/reports") return Promise.resolve(page(LISTING));
  if (parsed.pathname === "/reports/rex") return Promise.resolve(page(DETAIL));
  if (parsed.pathname === "/reports/bella") return Promise.resolve(page(RESOLVED_DETAIL));
  return Promise.resolve(new Response("Not found", {
    status: 404,
    headers: { "content-type": "text/plain" },
  }));
}

test("local D1 LOST_FOUND source-scoped flow creates one safe draft, reviews resolved new report and is idempotent", async () => {
  const filename = process.env.PSIPEDIA_E2E_D1_PATH;
  assert.ok(filename, "PSIPEDIA_E2E_D1_PATH is required");
  assert.equal(existsSync(filename), true, "local D1 sqlite file must exist");

  const database = d1Database(filename);
  const sqlite = database._sqlite;

  sqlite.prepare(`DELETE FROM canonical_external_provenance
    WHERE entity_type='LOST_FOUND' AND canonical_entity_id IN
      (SELECT id FROM lost_found_dog_reports WHERE source_url IN (?,?))`).run(DETAIL_URL, RESOLVED_URL);
  sqlite.prepare("DELETE FROM lost_found_dog_reports WHERE source_url IN (?,?)").run(DETAIL_URL, RESOLVED_URL);
  sqlite.prepare("DELETE FROM automation_sources WHERE source_key=?").run("e2e-lost-found-source-scoped");

  const created = await createAutomationSourceAdmin({
    sourceKey: "e2e-lost-found-source-scoped",
    label: "E2E LOST_FOUND source-scoped",
    entityType: "LOST_FOUND",
    connectorType: "CONTROLLED_HTML",
    sourceUrl: SOURCE_ROOT,
    cadenceMinutes: 1440,
    throttleMs: 0,
    timeoutMs: 5000,
    retryMaxAttempts: 0,
    retryBackoffMs: 100,
    maxRecordsPerRun: 20,
    config: {
      sourceShape: "MULTI_ITEM_LIST",
    },
  }, database, FIXED_NOW);
  assert.ok(created);
  assert.equal(created.enabled, false);
  assert.equal(created.reviewStatus, "PENDING");

  const approved = await reviewAutomationSource({
    id: created.id,
    action: "approve",
    reviewerEmail: "e2e@psipedia.sk",
    notes: "LOST_FOUND source-scoped local D1 regression",
    now: FIXED_NOW,
  }, database);
  assert.equal(approved?.reviewStatus, "APPROVED");

  await upsertGovernanceReview({
    subject: { type: "AUTOMATION_SOURCE", id: created.id },
    review: {
      accessStatus: "ALLOWED",
      robotsStatus: "NOT_APPLICABLE",
      termsStatus: "ALLOWED",
      recurringStatus: "APPROVED",
      retentionStatus: "RESTRICTED",
      retainUrl: true,
      retainTitle: false,
      retainSnippet: false,
      retainMetadata: true,
      retentionDays: null,
      minCadenceMinutes: null,
      maxRequestsPerDay: 20,
      manualOnly: false,
      pathScope: "/reports/**",
      restrictionsNote: "Deterministic LOST_FOUND E2E source.",
      termsUrl: null,
      privacyUrl: null,
      robotsUrl: null,
      evidenceUrl: SOURCE_ROOT,
      rationale: "Local D1 regression approves only the deterministic LOST_FOUND E2E scope.",
      expiresAt: null,
      reviewDueAt: null,
      expectedUpdatedAt: null,
    },
    actor: "e2e@psipedia.sk",
    now: FIXED_NOW,
  }, database);

  const enabled = await setAutomationSourceEnabled({
    id: created.id,
    enabled: true,
    now: FIXED_NOW,
    technicalGovernanceRefresh: {
      actor: "e2e@psipedia.sk",
      fetchImpl,
      tavilyCredentialConfigured: false,
    },
  }, database);
  assert.equal(enabled?.enabled, true);
  assert.equal(enabled?.reviewStatus, "APPROVED");

  const first = await runAutomationSourceNow(created.id, {
    database,
    now: FIXED_NOW,
    fetchImpl,
    htmlAdapters: productionAutomationHtmlAdapters,
  });
  assert.equal(first.status, "SUCCESS");
  assert.equal(first.checked, 2);
  assert.equal(first.draftCreated, 1);
  assert.equal(first.reviewOnly, 1);
  assert.equal(first.errors, 0);

  const report = sqlite.prepare(`SELECT
      id,type,status,published_at,dog_name,sex,breed,color,size,event_date,
      region,district,city,location_description,source_url
    FROM lost_found_dog_reports
    WHERE source_url=? AND dog_name=?
    ORDER BY id DESC LIMIT 1`).get(DETAIL_URL, DOG_NAME);
  assert.ok(report, "canonical LOST_FOUND draft must exist");
  assert.equal(report.type, "FOUND");
  assert.equal(report.status, "DRAFT");
  assert.equal(report.published_at, null);
  assert.equal(report.dog_name, DOG_NAME);
  assert.equal(report.sex, "MALE");
  assert.equal(report.breed, "Labrador");
  assert.equal(report.color, "čierna");
  assert.equal(report.size, "LARGE");
  assert.equal(report.event_date, "2026-10-05");
  assert.equal(report.region, "Nitriansky kraj");
  assert.equal(report.district, "Nitra");
  assert.equal(report.city, "Nitra");
  assert.equal(report.location_description, "Chrenová");
  assert.equal(report.source_url, DETAIL_URL);

  const resolvedCount = Number(sqlite.prepare(`SELECT COUNT(*) AS count
    FROM lost_found_dog_reports
    WHERE source_url=? OR dog_name=?`).get(RESOLVED_URL, RESOLVED_NAME).count);
  assert.equal(resolvedCount, 0);

  const provenance = sqlite.prepare(`SELECT COUNT(*) AS count
    FROM canonical_external_provenance
    WHERE entity_type='LOST_FOUND' AND canonical_entity_id=?`).get(report.id);
  assert.equal(Number(provenance.count), 1);

  const receipts = sqlite.prepare(`SELECT result, COUNT(*) AS count
    FROM automation_ingestion_receipts
    WHERE source_id=? AND entity_type='LOST_FOUND'
    GROUP BY result`).all(created.id).results;
  assert.deepEqual(receipts.map((row) => ({ result: row.result, count: Number(row.count) })), [
    { result: "DRAFT_CREATED", count: 1 },
  ]);

  const firstCount = Number(sqlite.prepare(`SELECT COUNT(*) AS count
    FROM lost_found_dog_reports WHERE source_url=? AND dog_name=?`).get(
      DETAIL_URL,
      DOG_NAME,
    ).count);
  assert.equal(firstCount, 1);

  const second = await runAutomationSourceNow(created.id, {
    database,
    now: new Date(FIXED_NOW.getTime() + 60_000),
    fetchImpl,
    htmlAdapters: productionAutomationHtmlAdapters,
  });
  assert.equal(second.status, "SUCCESS");
  assert.equal(second.checked, 2);
  assert.equal(second.draftCreated, 0);
  assert.equal(second.reviewOnly, 1);
  assert.equal(second.errors, 0);

  const secondCount = Number(sqlite.prepare(`SELECT COUNT(*) AS count
    FROM lost_found_dog_reports WHERE source_url=? AND dog_name=?`).get(
      DETAIL_URL,
      DOG_NAME,
    ).count);
  const secondReceiptCount = Number(sqlite.prepare(`SELECT COUNT(*) AS count
    FROM automation_ingestion_receipts
    WHERE source_id=? AND entity_type='LOST_FOUND'`).get(created.id).count);
  const secondProvenanceCount = Number(sqlite.prepare(`SELECT COUNT(*) AS count
    FROM canonical_external_provenance
    WHERE entity_type='LOST_FOUND' AND canonical_entity_id=?`).get(report.id).count);

  assert.equal(secondCount, 1);
  assert.equal(secondReceiptCount, 1);
  assert.equal(secondProvenanceCount, 1);

  const stored = await getAutomationSourceAdmin(created.id, database);
  assert.equal(stored?.enabled, true);
  assert.equal(stored?.reviewStatus, "APPROVED");

  database._sqlite.close();
});
