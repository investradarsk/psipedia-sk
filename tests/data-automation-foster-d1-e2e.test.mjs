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

const SOURCE_ROOT = "https://foster-e2e.example/cases";
const DETAIL_URL = SOURCE_ROOT + "/max";
const RESOLVED_URL = SOURCE_ROOT + "/bella";
const ORGANIZATION = "E2E Source Scoped Foster";
const DOG_NAME = "Max E2E Foster";
const RESOLVED_NAME = "Bella E2E Foster";
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
    <h1>Dočasná opatera</h1>
    <article class="foster-card"><a class="dog-name" href="/cases/max">${DOG_NAME}</a></article>
    <article class="foster-card"><a class="dog-name" href="/cases/bella">${RESOLVED_NAME}</a></article>
  </body>
</html>`;

const DETAIL = `<!doctype html>
<html lang="sk">
  <head>
    <link rel="canonical" href="${DETAIL_URL}">
    <meta name="description" content="Konkrétny profil psa hľadajúceho dočasnú opateru.">
  </head>
  <body>
    <h1>Dočasná opatera pre ${DOG_NAME}</h1>
    <p>Dočasná opatera</p>
    <p>Meno: ${DOG_NAME}</p>
    <p>Plemeno: Labrador</p>
    <p>Vek: 2 roky</p>
    <p>Mesto: Nitra</p>
    <p>Urgentné: áno</p>
  </body>
</html>`;

const RESOLVED_DETAIL = `<!doctype html>
<html lang="sk">
  <head>
    <link rel="canonical" href="${RESOLVED_URL}">
    <meta name="description" content="Prípad má už zabezpečenú dočasnú opateru.">
  </head>
  <body>
    <h1>Dočasná opatera pre ${RESOLVED_NAME}</h1>
    <p>Dočasná opatera</p>
    <p>Meno: ${RESOLVED_NAME}</p>
    <p>Plemeno: kríženec</p>
    <p>Vek: 3 roky</p>
    <p>Mesto: Nitra</p>
    <p>Stav: dočaska zabezpečená</p>
  </body>
</html>`;

function fetchImpl(input) {
  const url = typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
  const parsed = new URL(url);
  if (parsed.origin !== "https://foster-e2e.example") {
    throw new Error("unexpected_e2e_fetch_origin:" + parsed.origin);
  }
  if (parsed.pathname === "/cases") return Promise.resolve(page(LISTING));
  if (parsed.pathname === "/cases/max") return Promise.resolve(page(DETAIL));
  if (parsed.pathname === "/cases/bella") return Promise.resolve(page(RESOLVED_DETAIL));
  return Promise.resolve(new Response("Not found", {
    status: 404,
    headers: { "content-type": "text/plain" },
  }));
}

test("local D1 FOSTER source-scoped flow is draft-safe, review-aware and idempotent", async () => {
  const filename = process.env.PSIPEDIA_E2E_D1_PATH;
  assert.ok(filename, "PSIPEDIA_E2E_D1_PATH is required");
  assert.equal(existsSync(filename), true, "local D1 sqlite file must exist");

  const database = d1Database(filename);
  const sqlite = database._sqlite;

  sqlite.prepare(`DELETE FROM canonical_external_provenance
    WHERE entity_type='FOSTER' AND canonical_entity_id IN
      (SELECT id FROM help_cases WHERE category='docasna-opatera' AND organization=?)`).run(ORGANIZATION);
  sqlite.prepare("DELETE FROM help_cases WHERE category='docasna-opatera' AND organization=?").run(ORGANIZATION);
  sqlite.prepare("DELETE FROM automation_sources WHERE source_key=?").run("e2e-foster-source-scoped");

  const created = await createAutomationSourceAdmin({
    sourceKey: "e2e-foster-source-scoped",
    label: "E2E FOSTER source-scoped",
    entityType: "FOSTER",
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
      staticFields: { organizationName: ORGANIZATION },
    },
  }, database, FIXED_NOW);
  assert.ok(created);
  assert.equal(created.enabled, false);
  assert.equal(created.reviewStatus, "PENDING");

  const approved = await reviewAutomationSource({
    id: created.id,
    action: "approve",
    reviewerEmail: "e2e@psipedia.sk",
    notes: "FOSTER source-scoped local D1 regression",
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
      pathScope: "/cases/**",
      restrictionsNote: "Deterministic FOSTER E2E source.",
      termsUrl: null,
      privacyUrl: null,
      robotsUrl: null,
      evidenceUrl: SOURCE_ROOT,
      rationale: "Local D1 regression approves only the deterministic FOSTER E2E scope.",
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

  const foster = sqlite.prepare(`SELECT id,title,category,status,published_at,resolved,dog_name,organization,action_url
    FROM help_cases
    WHERE category='docasna-opatera' AND organization=? AND dog_name=?
    ORDER BY id DESC LIMIT 1`).get(ORGANIZATION, DOG_NAME);
  assert.ok(foster, "canonical foster draft must exist");
  assert.equal(foster.category, "docasna-opatera");
  assert.equal(String(foster.status).toLowerCase(), "draft");
  assert.equal(foster.published_at, null);
  assert.equal(Number(foster.resolved), 0);
  assert.equal(foster.title, "Dočasná opatera pre " + DOG_NAME);
  assert.equal(foster.dog_name, DOG_NAME);
  assert.equal(foster.organization, ORGANIZATION);
  assert.equal(foster.action_url, DETAIL_URL);

  const resolvedCount = Number(sqlite.prepare(`SELECT COUNT(*) AS count
    FROM help_cases
    WHERE category='docasna-opatera' AND organization=? AND dog_name=?`).get(
      ORGANIZATION,
      RESOLVED_NAME,
    ).count);
  assert.equal(resolvedCount, 0);

  const provenance = sqlite.prepare(`SELECT COUNT(*) AS count
    FROM canonical_external_provenance
    WHERE entity_type='FOSTER' AND canonical_entity_id=?`).get(foster.id);
  assert.equal(Number(provenance.count), 1);

  const receipts = sqlite.prepare(`SELECT COUNT(*) AS count
    FROM automation_ingestion_receipts
    WHERE source_id=? AND entity_type='FOSTER'`).get(created.id);
  assert.equal(Number(receipts.count), 1);

  const firstCount = Number(sqlite.prepare(`SELECT COUNT(*) AS count
    FROM help_cases WHERE category='docasna-opatera' AND organization=? AND dog_name=?`).get(
      ORGANIZATION,
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
    FROM help_cases WHERE category='docasna-opatera' AND organization=? AND dog_name=?`).get(
      ORGANIZATION,
      DOG_NAME,
    ).count);
  const secondReceiptCount = Number(sqlite.prepare(`SELECT COUNT(*) AS count
    FROM automation_ingestion_receipts
    WHERE source_id=? AND entity_type='FOSTER'`).get(created.id).count);
  const secondProvenanceCount = Number(sqlite.prepare(`SELECT COUNT(*) AS count
    FROM canonical_external_provenance
    WHERE entity_type='FOSTER' AND canonical_entity_id=?`).get(foster.id).count);

  assert.equal(secondCount, 1);
  assert.equal(secondReceiptCount, 1);
  assert.equal(secondProvenanceCount, 1);

  const stored = await getAutomationSourceAdmin(created.id, database);
  assert.equal(stored?.enabled, true);
  assert.equal(stored?.reviewStatus, "APPROVED");

  database._sqlite.close();
});
