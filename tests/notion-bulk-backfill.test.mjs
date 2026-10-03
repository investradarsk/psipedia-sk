import assert from "node:assert/strict";
import test from "node:test";

import {
  chunkItems,
  executeReconciliationPlan,
  normalizeCanonicalUrl,
  planNotionReconciliation,
  validateNotionSchema,
} from "../lib/notion-bulk-reconciliation.ts";
import {
  buildNotionUpdateDiagnostics,
  notionBulkAgendaKeysForScope,
  isNotionBulkScope,
} from "../lib/notion-bulk-backfill.ts";
import {
  notionRequest,
  notionRetryDelayMs,
  notionRetryableStatus,
} from "../lib/notion-sync-shared.ts";

function source(id, title = "Profil", url = `https://psipedia.sk/x/${id}`, properties = {}, ownership = {}) {
  return { id: String(id), title, url, properties, ownership };
}

function page(
  pageId,
  id,
  title = "Profil",
  url = `https://psipedia.sk/x/${id}`,
  properties = {},
  propertyTypes = {},
) {
  return {
    pageId,
    title,
    psipediaId: String(id ?? ""),
    url,
    properties: {
      "Psipedia ID": String(id ?? ""),
      "URL Psipedia": url,
      ...properties,
    },
    propertyTypes,
  };
}

test("new canonical profile plans CREATE", () => {
  const plan = planNotionReconciliation([source(1)], []);
  assert.equal(plan.create, 1);
  assert.equal(plan.actions[0].kind, "CREATE");
});

test("existing Psipedia ID matches and plans UPDATE only for safe field", () => {
  const plan = planNotionReconciliation(
    [source(1, "A", "https://psipedia.sk/x/1", { "Slug": "novy", "Web": "https://example.sk" }, { Slug: "system" })],
    [page("p1", 1, "A", "https://psipedia.sk/x/1", { "Slug": "stary", "Web": "" })],
  );
  assert.equal(plan.matched, 1);
  assert.equal(plan.update, 1);
  assert.deepEqual(plan.actions[0].changes, { Slug: "novy", Web: "https://example.sk" });
});

test("same canonical data plans UNCHANGED", () => {
  const plan = planNotionReconciliation(
    [source(1, "A", "https://psipedia.sk/x/1", { Web: "https://example.sk" })],
    [page("p1", 1, "A", "https://psipedia.sk/x/1", { Web: "https://example.sk" })],
  );
  assert.equal(plan.unchanged, 1);
});

test("dry-run diagnostics count update fields and show source vs Notion values", () => {
  const notion = [
    page(
      "p1",
      1,
      "A",
      "https://psipedia.sk/x/1",
      { Slug: "old-a", "Aktualizované": "2026-08-16T09:01:00Z" },
      { Slug: "rich_text", "Aktualizované": "date" },
    ),
    page(
      "p2",
      2,
      "B",
      "https://psipedia.sk/x/2",
      { Slug: "old-b", "Aktualizované": "2026-08-16T10:01:00Z" },
      { Slug: "rich_text", "Aktualizované": "date" },
    ),
  ];
  const plan = planNotionReconciliation(
    [
      source(
        1,
        "A",
        "https://psipedia.sk/x/1",
        { Slug: "new-a", "Aktualizované": "2026-08-17T09:01:00Z" },
        { Slug: "system", "Aktualizované": "system" },
      ),
      source(
        2,
        "B",
        "https://psipedia.sk/x/2",
        { Slug: "new-b", "Aktualizované": "2026-08-17T10:01:00Z" },
        { Slug: "system", "Aktualizované": "system" },
      ),
    ],
    notion,
  );

  const diagnostics = buildNotionUpdateDiagnostics(plan, notion);
  assert.deepEqual(diagnostics.updateFieldCounts, {
    "Aktualizované": 2,
    Slug: 2,
  });
  assert.equal(diagnostics.updateSamples.length, 4);
  assert.deepEqual(
    diagnostics.updateSamples.find((sample) => sample.field === "Aktualizované"),
    {
      psipediaId: "1",
      title: "A",
      notionPageId: "p1",
      field: "Aktualizované",
      propertyType: "date",
      sourceValue: "2026-08-17T09:01:00Z",
      notionValue: "2026-08-16T09:01:00Z",
    },
  );
});

test("date round-trip with equivalent ISO datetime plans UNCHANGED", () => {
  const plan = planNotionReconciliation(
    [source(1, "A", "https://psipedia.sk/x/1", { "Aktualizované": "2026-08-17T09:01:00.000Z" }, { "Aktualizované": "system" })],
    [page("p1", 1, "A", "https://psipedia.sk/x/1", { "Aktualizované": "2026-08-17T09:01:00Z" }, { "Aktualizované": "date" })],
  );
  assert.equal(plan.update, 0);
  assert.equal(plan.unchanged, 1);
});

test("system-owned date round-trip tolerates Notion minute truncation", () => {
  const plan = planNotionReconciliation(
    [source(
      1,
      "A",
      "https://psipedia.sk/x/1",
      { "Aktualizované": "2026-09-13T14:41:07.345Z" },
      { "Aktualizované": "system" },
    )],
    [page(
      "p1",
      1,
      "A",
      "https://psipedia.sk/x/1",
      { "Aktualizované": "2026-09-13T14:41:00.000+00:00" },
      { "Aktualizované": "date" },
    )],
  );
  assert.equal(plan.update, 0);
  assert.equal(plan.unchanged, 1);
});

test("system-owned date in a different minute still plans UPDATE", () => {
  const plan = planNotionReconciliation(
    [source(
      1,
      "A",
      "https://psipedia.sk/x/1",
      { "Aktualizované": "2026-09-13T14:42:07.345Z" },
      { "Aktualizované": "system" },
    )],
    [page(
      "p1",
      1,
      "A",
      "https://psipedia.sk/x/1",
      { "Aktualizované": "2026-09-13T14:41:00.000+00:00" },
      { "Aktualizované": "date" },
    )],
  );
  assert.equal(plan.update, 1);
  assert.deepEqual(plan.actions[0].changes, {
    "Aktualizované": "2026-09-13T14:42:07.345Z",
  });
});

test("fill-missing dates keep exact comparison and do not get minute tolerance", () => {
  const plan = planNotionReconciliation(
    [source(
      1,
      "A",
      "https://psipedia.sk/x/1",
      { "Dátum hlásenia": "2026-09-13T14:41:07.345Z" },
    )],
    [page(
      "p1",
      1,
      "A",
      "https://psipedia.sk/x/1",
      { "Dátum hlásenia": "2026-09-13T14:41:00.000+00:00" },
      { "Dátum hlásenia": "date" },
    )],
  );
  assert.equal(plan.conflict, 1);
  assert.deepEqual(plan.actions[0].conflictFields, ["Dátum hlásenia"]);
});

test("date-only round-trip plans UNCHANGED", () => {
  const plan = planNotionReconciliation(
    [source(1, "A", "https://psipedia.sk/x/1", { "Dátum hlásenia": "2026-08-17" })],
    [page("p1", 1, "A", "https://psipedia.sk/x/1", { "Dátum hlásenia": "2026-08-17" }, { "Dátum hlásenia": "date" })],
  );
  assert.equal(plan.unchanged, 1);
});

test("real system-owned date difference still plans UPDATE", () => {
  const plan = planNotionReconciliation(
    [source(1, "A", "https://psipedia.sk/x/1", { "Aktualizované": "2026-08-18" }, { "Aktualizované": "system" })],
    [page("p1", 1, "A", "https://psipedia.sk/x/1", { "Aktualizované": "2026-08-17" }, { "Aktualizované": "date" })],
  );
  assert.equal(plan.update, 1);
  assert.deepEqual(plan.actions[0].changes, { "Aktualizované": "2026-08-18" });
});

test("repeated execute is idempotent after Notion date round-trip formatting", async () => {
  const desired = source(
    1,
    "A",
    "https://psipedia.sk/x/1",
    { "Aktualizované": "2026-08-17T09:01:00.000Z" },
    { "Aktualizované": "system" },
  );
  const firstPlan = planNotionReconciliation(
    [desired],
    [page("p1", 1, "A", "https://psipedia.sk/x/1", { "Aktualizované": "2026-08-16T09:01:00Z" }, { "Aktualizované": "date" })],
  );
  assert.equal(firstPlan.update, 1);

  let writtenChanges = null;
  const execution = await executeReconciliationPlan(firstPlan, {
    dryRun: false,
    maxWrites: 100,
    writeDelayMs: 0,
    create: async () => {},
    update: async (_pageId, changes) => { writtenChanges = changes; },
  });
  assert.equal(execution.updated, 1);
  assert.deepEqual(writtenChanges, { "Aktualizované": "2026-08-17T09:01:00.000Z" });

  const secondPlan = planNotionReconciliation(
    [desired],
    [page("p1", 1, "A", "https://psipedia.sk/x/1", { "Aktualizované": "2026-08-17T09:01:00Z" }, { "Aktualizované": "date" })],
  );
  assert.equal(secondPlan.update, 0);
  assert.equal(secondPlan.unchanged, 1);
});

test("manual non-empty SEO title difference remains a conflict", () => {
  const plan = planNotionReconciliation(
    [source(1, "A", "https://psipedia.sk/x/1", { "SEO title": "Psipedia source title" })],
    [page("p1", 1, "A", "https://psipedia.sk/x/1", { "SEO title": "Manuálny Notion title" }, { "SEO title": "rich_text" })],
  );
  assert.equal(plan.conflict, 1);
  assert.equal(plan.actions[0].reason, "NON_EMPTY_NOTION_VALUE_DIFFERS");
  assert.deepEqual(plan.actions[0].conflictFields, ["SEO title"]);
});

test("canonical URL normalization keeps query semantics while removing hash and trailing slash", () => {
  assert.equal(
    normalizeCanonicalUrl("https://EXAMPLE.sk/path/?a=1&b=2#sekcia"),
    "https://example.sk/path?a=1&b=2",
  );
});

test("repeat run after create is idempotent and does not plan duplicate create", () => {
  const first = planNotionReconciliation([source(1)], []);
  assert.equal(first.create, 1);
  const second = planNotionReconciliation([source(1)], [page("created-page", 1)]);
  assert.equal(second.create, 0);
  assert.equal(second.unchanged, 1);
});

test("same title with different IDs stays two legitimate entities", () => {
  const plan = planNotionReconciliation([
    source(1, "Rovnaký názov", "https://psipedia.sk/x/1"),
    source(2, "Rovnaký názov", "https://psipedia.sk/x/2"),
  ], []);
  assert.equal(plan.create, 2);
  assert.equal(plan.conflict, 0);
  assert.equal(plan.duplicate, 0);
});

test("duplicate Psipedia ID in Notion becomes DUPLICATE conflict and is not deleted", () => {
  const plan = planNotionReconciliation(
    [source(1)],
    [page("p1", 1), page("p2", 1)],
  );
  assert.equal(plan.duplicate, 1);
  assert.deepEqual(plan.actions[0].notionPageIds, ["p1", "p2"]);
  assert.match(plan.actions[0].reason, /DUPLICATE_CONFLICT/);
});

test("URL fallback matches when Psipedia ID is missing", () => {
  const notion = page("p1", "", "A", "https://psipedia.sk/x/1");
  notion.properties["Psipedia ID"] = "";
  const plan = planNotionReconciliation([source(1)], [notion]);
  assert.equal(plan.matched, 1);
  assert.equal(plan.create, 0);
  assert.equal(plan.update, 1);
  assert.equal(plan.actions[0].changes["Psipedia ID"], "1");
});

test("ID match plus a second URL-only page is reported as canonical duplicate", () => {
  const url = "https://psipedia.sk/x/1";
  const urlOnly = page("p2", "", "A", url);
  urlOnly.properties["Psipedia ID"] = "";
  const plan = planNotionReconciliation(
    [source(1, "A", url)],
    [page("p1", 1, "A", url), urlOnly],
  );
  assert.equal(plan.duplicate, 1);
  assert.deepEqual(new Set(plan.actions[0].notionPageIds), new Set(["p1", "p2"]));
});

test("duplicate canonical identity on source side fails closed", () => {
  const plan = planNotionReconciliation([
    source(1, "A", "https://psipedia.sk/x/shared"),
    source(2, "B", "https://psipedia.sk/x/shared"),
  ], []);
  assert.equal(plan.create, 0);
  assert.equal(plan.conflict, 2);
  assert.equal(plan.actions.every((action) => action.reason === "SOURCE_CANONICAL_IDENTITY_CONFLICT"), true);
});

test("non-empty conflicting Notion value is reported, not overwritten", () => {
  const plan = planNotionReconciliation(
    [source(1, "A", "https://psipedia.sk/x/1", { Web: "https://source.sk" })],
    [page("p1", 1, "A", "https://psipedia.sk/x/1", { Web: "https://manual.sk" })],
  );
  assert.equal(plan.conflict, 1);
  assert.deepEqual(plan.actions[0].conflictFields, ["Web"]);
});

test("one Notion write error does not stop remaining items", async () => {
  const plan = planNotionReconciliation([source(1), source(2)], []);
  const written = [];
  const summary = await executeReconciliationPlan(plan, {
    dryRun: false,
    create: async (record) => {
      if (record.id === "1") throw new Error("Notion failed");
      written.push(record.id);
    },
    update: async () => {},
  });
  assert.equal(summary.error, 1);
  assert.deepEqual(written, ["2"]);
  assert.equal(summary.processed, 2);
});

test("429 is retryable and notionRequest retries with bounded Retry-After", async () => {
  assert.equal(notionRetryableStatus(429), true);
  assert.equal(notionRetryableStatus(400), false);
  assert.equal(notionRetryDelayMs(3, "0"), 0);

  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return new Response(JSON.stringify({ message: "rate limited" }), {
        status: 429,
        headers: { "retry-after": "0" },
      });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  try {
    const result = await notionRequest({ NOTION_API_TOKEN: "test-token" }, "/users/me");
    assert.deepEqual(result, { ok: true });
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("dry-run executes zero write callbacks", async () => {
  const plan = planNotionReconciliation([source(1), source(2)], []);
  let writes = 0;
  const summary = await executeReconciliationPlan(plan, {
    dryRun: true,
    create: async () => { writes += 1; },
    update: async () => { writes += 1; },
  });
  assert.equal(writes, 0);
  assert.equal(summary.skipped, 2);
});

test("more than 100 actions are split into safe batches", async () => {
  const sources = Array.from({ length: 205 }, (_, index) => source(index + 1));
  const plan = planNotionReconciliation(sources, []);
  const summary = await executeReconciliationPlan(plan, {
    dryRun: true,
    batchSize: 100,
    create: async () => {},
    update: async () => {},
  });
  assert.equal(summary.batches.length, 3);
  assert.deepEqual(summary.batches.map((batch) => batch.processed), [100, 100, 5]);
  assert.deepEqual(chunkItems(sources, 100).map((batch) => batch.length), [100, 100, 5]);
});

test("execute write budget caps a resumable run without failing the remainder", async () => {
  const sources = Array.from({ length: 205 }, (_, index) => source(index + 1));
  const plan = planNotionReconciliation(sources, []);
  let writes = 0;
  const summary = await executeReconciliationPlan(plan, {
    dryRun: false,
    batchSize: 100,
    maxWrites: 100,
    writeDelayMs: 0,
    create: async () => { writes += 1; },
    update: async () => { writes += 1; },
  });
  assert.equal(writes, 100);
  assert.equal(summary.created, 100);
  assert.equal(summary.skipped, 105);
  assert.equal(summary.error, 0);
});

test("services, events and help scopes resolve to the intended agendas", () => {
  assert.equal(isNotionBulkScope("services"), true);
  assert.equal(isNotionBulkScope("events"), true);
  assert.equal(isNotionBulkScope("help"), true);
  assert.deepEqual(notionBulkAgendaKeysForScope("services"), ["services"]);
  assert.deepEqual(notionBulkAgendaKeysForScope("events"), ["events"]);
  assert.deepEqual(
    notionBulkAgendaKeysForScope("help"),
    ["organizations", "adoptions", "help-cases", "lost-found"],
  );
});

test("missing required Notion property fails safe in schema validation", () => {
  const result = validateNotionSchema(["Názov", "URL Psipedia"], ["Názov", "Psipedia ID", "URL Psipedia"], ["Web"]);
  assert.deepEqual(result.missingRequired, ["Psipedia ID"]);
  assert.deepEqual(result.missingOptional, ["Web"]);
});
