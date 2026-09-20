import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  automationFindingFingerprint,
  automationReviewEffect,
  canonicalizeSourceUrl,
  classifyAutomationFinding,
  isSafeAutomationSourceUrl,
  sha256Hex,
  shouldReopenSuppressedFinding,
} from "../lib/data-automation.ts";
import {
  AutomationConnectorError,
  fetchAutomationSourceRecords,
} from "../lib/data-automation-connectors.ts";
import { selectSafeAutomationMatch } from "../lib/data-automation-matching.ts";

function source(overrides = {}) {
  return {
    id: 1,
    sourceKey: "events-reference",
    label: "Events reference",
    entityType: "EVENT",
    connectorType: "STRUCTURED_JSON",
    sourceUrl: "https://example.com/events.json",
    config: {
      recordsPath: "items",
      idField: "id",
      urlField: "url",
      fields: {
        title: "title",
        startDate: "start_date",
        organizer: "organizer",
        city: "city",
      },
    },
    enabled: true,
    cadenceMinutes: 360,
    throttleMs: 1000,
    timeoutMs: 5000,
    retryMaxAttempts: 2,
    retryBackoffMs: 100,
    maxRecordsPerRun: 100,
    nextCheckAt: null,
    ...overrides,
  };
}

function record(overrides = {}) {
  return {
    sourceRecordId: "evt-1",
    sourceUrl: "https://example.com/events/1",
    sourceTimestamp: "2026-09-20T10:00:00Z",
    rawRecord: { id: "evt-1" },
    proposed: {
      title: "Psia výstava",
      startDate: "2026-10-12",
      organizer: "Klub psov",
      city: "Nitra",
    },
    ...overrides,
  };
}

test("1. repeated normalized payload keeps the same stable finding identity", async () => {
  const leftHash = await sha256Hex({ organizer: "Klub", title: "Event" });
  const rightHash = await sha256Hex({ title: "Event", organizer: "Klub" });
  assert.equal(leftHash, rightHash);
  const input = {
    sourceKey: "events",
    sourceRecordId: "123",
    findingType: "POSSIBLE_UPDATE",
    canonicalEntityId: 9,
    payloadHash: leftHash,
  };
  assert.equal(automationFindingFingerprint(input), automationFindingFingerprint({ ...input, payloadHash: rightHash }));
  const store = readFileSync(new URL("../lib/data-automation-store.ts", import.meta.url), "utf8");
  assert.match(store, /ON CONFLICT\(source_id,source_record_id,payload_hash\) DO NOTHING/);
  assert.match(store, /WHERE fingerprint=\? LIMIT 1/);
});

test("2. unmatched source record becomes NEW_ENTITY finding", () => {
  const match = { entityType: "EVENT", entityId: null, entityKey: null, quality: "NONE", before: null };
  const result = classifyAutomationFinding({ match, proposed: record().proposed });
  assert.equal(result?.findingType, "NEW_ENTITY");
  assert.ok(Object.keys(result?.diff ?? {}).length > 0);
});

test("3. exact canonical match with changed value becomes POSSIBLE_UPDATE", () => {
  const proposed = record().proposed;
  const match = {
    entityType: "EVENT",
    entityId: 4,
    entityKey: "event:4",
    quality: "EXACT_CANONICAL_KEY",
    before: { ...proposed, city: "Bratislava" },
  };
  const result = classifyAutomationFinding({ match, proposed });
  assert.equal(result?.findingType, "POSSIBLE_UPDATE");
  assert.deepEqual(result?.diff.city, { before: "Bratislava", after: "Nitra" });
});

test("4. unchanged source creates no duplicate finding", () => {
  const proposed = record().proposed;
  const match = {
    entityType: "EVENT",
    entityId: 4,
    entityKey: "event:4",
    quality: "EXACT_CANONICAL_KEY",
    before: { ...proposed },
  };
  assert.equal(classifyAutomationFinding({ match, proposed }), null);
});

test("5. rejected or suppressed unchanged payload stays closed until payload/time changes", () => {
  const future = "2026-10-20T00:00:00.000Z";
  const now = new Date("2026-09-20T00:00:00.000Z");
  assert.equal(shouldReopenSuppressedFinding({ reviewStatus: "REJECTED", suppressedUntil: null, now, payloadChanged: false }), false);
  assert.equal(shouldReopenSuppressedFinding({ reviewStatus: "SUPPRESSED", suppressedUntil: future, now, payloadChanged: false }), false);
  assert.equal(shouldReopenSuppressedFinding({ reviewStatus: "SUPPRESSED", suppressedUntil: "2026-09-19T00:00:00.000Z", now, payloadChanged: false }), true);
  assert.equal(shouldReopenSuppressedFinding({ reviewStatus: "REJECTED", suppressedUntil: null, now, payloadChanged: true }), true);
});

test("6. terminal source failure is surfaced as a typed connector error", async () => {
  let calls = 0;
  await assert.rejects(
    fetchAutomationSourceRecords(source({ retryMaxAttempts: 1 }), {
      fetchImpl: async () => {
        calls += 1;
        return new Response("busy", { status: 503 });
      },
      sleep: async () => {},
    }),
    (error) => error instanceof AutomationConnectorError && error.code === "source_http_503",
  );
  assert.equal(calls, 2);
});

test("7. retry-safe connector succeeds after a transient source failure", async () => {
  let calls = 0;
  const rows = await fetchAutomationSourceRecords(source(), {
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return new Response("busy", { status: 503 });
      return new Response(JSON.stringify({
        items: [{ id: "1", title: "Event", start_date: "2026-10-01", organizer: "Klub", city: "Nitra", url: "https://example.com/e/1" }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
    sleep: async () => {},
  });
  assert.equal(calls, 2);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sourceRecordId, "1");
});

test("8. source processing is bounded by maxRecordsPerRun", async () => {
  const rows = await fetchAutomationSourceRecords(source({ maxRecordsPerRun: 2, retryMaxAttempts: 0 }), {
    fetchImpl: async () => new Response(JSON.stringify({
      items: Array.from({ length: 6 }, (_, index) => ({
        id: String(index + 1),
        title: `Event ${index + 1}`,
        start_date: "2026-10-01",
        organizer: "Klub",
        city: "Nitra",
      })),
    }), { status: 200, headers: { "content-type": "application/json" } }),
  });
  assert.equal(rows.length, 2);
});

test("9. safe canonical matching prefers exact deterministic identity", () => {
  const match = selectSafeAutomationMatch({
    entityType: "EVENT",
    record: record({ sourceUrl: "https://example.com/event/1?utm_source=fb" }),
    candidates: [{
      id: 8,
      key: "event:8",
      before: { title: "Psia výstava" },
      sourceUrl: "https://example.com/event/1",
      name: "Iný názov",
      date: "2026-11-01",
      organizer: "Iný klub",
    }],
  });
  assert.equal(match.entityId, 8);
  assert.equal(match.quality, "EXACT_CANONICAL_KEY");
  assert.equal(canonicalizeSourceUrl("https://www.example.com/event/1?utm_source=fb&gclid=x#top"), "https://example.com/event/1");
  assert.equal(isSafeAutomationSourceUrl("https://127.0.0.1/feed"), false);
  assert.equal(isSafeAutomationSourceUrl("https://[fc00::1]/feed"), false);
  assert.equal(isSafeAutomationSourceUrl("http://example.com/feed"), false);
  assert.equal(isSafeAutomationSourceUrl("https://example.com/feed"), true);
});

test("10. equally strong candidates remain human review", () => {
  const inputRecord = record();
  const match = selectSafeAutomationMatch({
    entityType: "EVENT",
    record: inputRecord,
    candidates: [1, 2].map((id) => ({
      id,
      key: `event:${id}`,
      before: { ...inputRecord.proposed },
      name: "Psia výstava",
      date: "2026-10-12",
      organizer: "Klub psov",
    })),
  });
  assert.equal(match.quality, "UNCERTAIN");
  assert.equal(match.entityId, null);
  assert.equal(match.candidates?.length, 2);
  assert.equal(classifyAutomationFinding({ match, proposed: inputRecord.proposed })?.findingType, "DUPLICATE_CANDIDATE");
});

test("11. approval contract never bypasses module publication rules", () => {
  const effect = automationReviewEffect("approve");
  assert.equal(effect.reviewStatus, "APPROVED");
  assert.equal(effect.canonicalWrite, false);
  assert.equal(effect.publication, false);
  const store = readFileSync(new URL("../lib/data-automation-store.ts", import.meta.url), "utf8");
  const runner = readFileSync(new URL("../lib/data-automation-runner.ts", import.meta.url), "utf8");
  assert.doesNotMatch(store + runner, /UPDATE\s+(?:managed_events|help_organizations|directory_profiles|adoption_dogs|lost_found_dog_reports|help_cases)\b/i);
  assert.doesNotMatch(store + runner, /createManagedEvent|updateManagedEvent|updateManagedAdoption|updateHelpOrganization/i);
});

test("12. unauthorized review action is blocked by the existing admin auth contract", () => {
  const api = readFileSync(new URL("../app/api/admin/automation-findings/[id]/route.ts", import.meta.url), "utf8");
  assert.match(api, /getAdminApiUser\(\)/);
  assert.match(api, /unauthorizedAdminResponse\(\)/);
  assert.match(api, /if \(!user\)/);
});

test("13. scheduled job reuses the existing hourly Worker contract and stays bounded", () => {
  const worker = readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8");
  const wrangler = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  const runner = readFileSync(new URL("../lib/data-automation-runner.ts", import.meta.url), "utf8");
  assert.match(worker, /productionAutomationHtmlAdapters/);
  assert.match(worker, /runDataAutomationSweep\(\{ database: env\.DB, htmlAdapters: productionAutomationHtmlAdapters \}\)/);
  assert.match(wrangler, /"crons": \["0 \* \* \* \*"\]/);
  assert.match(runner, /DATA_AUTOMATION_MAX_SOURCES_PER_SWEEP = 8/);
  assert.match(runner, /for \(const source of sources\)/);
});

test("14. finding notifications reuse the reliable editorial outbox", () => {
  const migration = readFileSync(new URL("../drizzle/0050_data_automation_foundation.sql", import.meta.url), "utf8");
  const notifications = readFileSync(new URL("../lib/editorial-notifications.ts", import.meta.url), "utf8");
  assert.match(migration, /'automation_finding'/);
  assert.match(notifications, /"automation_finding"/);
  assert.match(notifications, /INSERT INTO editorial_notifications/);
  assert.doesNotMatch(migration + notifications, /automation_notifications/);
  assert.match(notifications, /WHERE status IN \('pending','failed'\)/);
});

test("provenance storage keeps raw, normalized, source timestamp and canonicalized URL fields", () => {
  const migration = readFileSync(new URL("../drizzle/0050_data_automation_foundation.sql", import.meta.url), "utf8");
  for (const field of ["source_record_id", "source_url", "source_timestamp", "raw_payload_json", "normalized_payload_json", "payload_hash", "detected_at"]) {
    assert.match(migration, new RegExp(field));
  }
});

test("controlled HTML has no generic browser dependency and manual import performs no fetch", async () => {
  const manual = source({ connectorType: "MANUAL_IMPORT", sourceUrl: null });
  let fetched = false;
  const rows = await fetchAutomationSourceRecords(manual, {
    fetchImpl: async () => { fetched = true; return new Response("never"); },
  });
  assert.deepEqual(rows, []);
  assert.equal(fetched, false);
  const connector = readFileSync(new URL("../lib/data-automation-connectors.ts", import.meta.url), "utf8");
  assert.doesNotMatch(connector, /tinyfish|playwright|puppeteer|chromium/i);
  assert.match(connector, /controlled_html_adapter_not_configured/);
});
