import assert from "node:assert/strict";
import test from "node:test";
import {
  TAVILY_CRAWL_ENDPOINT,
  TAVILY_EXTRACT_ENDPOINT,
  TavilyAutomationCrawlProvider,
  TavilyAutomationExtractProvider,
  TavilySourceScopedError,
} from "../lib/data-automation-tavily-source-scoped.ts";
import {
  buildSourceScopedExtractionContract,
  automationCoverageCanInferAbsence,
} from "../lib/data-automation-source-scoped-extraction.ts";
import { normalizeAutomationEventRecord } from "../lib/data-automation-event-normalize.ts";
import { validateDynamicAutomationIngestion } from "../lib/data-automation-dynamic-identity.ts";

function source(overrides = {}) {
  return {
    id: 91,
    sourceKey: "tavily-source",
    label: "Tavily source",
    entityType: "ADOPTION",
    connectorType: "CONTROLLED_HTML",
    sourceUrl: "https://example.sk/psy",
    config: { sourceShape: "MULTI_ITEM_LIST" },
    enabled: true,
    cadenceMinutes: 1440,
    throttleMs: 0,
    timeoutMs: 5000,
    retryMaxAttempts: 0,
    retryBackoffMs: 1,
    maxRecordsPerRun: 50,
    nextCheckAt: null,
    reviewStatus: "APPROVED",
    ...overrides,
  };
}

function contract(src = source(), pathScope = "include:/psy/**;exclude:/psy/archiv/**") {
  const built = buildSourceScopedExtractionContract(src, {
    pathScope,
    maxRequestsPerDay: 12,
  });
  assert.equal(built.ready, true);
  return built.contract;
}

function gate(allowed = true) {
  const reservations = [];
  const finalized = [];
  return {
    reservations,
    finalized,
    value: {
      async reserve(operation) {
        reservations.push(operation);
        return allowed ? { operationKey: "op-" + operation.toLowerCase() + "-" + reservations.length } : null;
      },
      async finalize(value) {
        finalized.push(value);
      },
    },
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function payload(results, extra = {}) {
  return {
    results,
    failed_results: [],
    response_time: 0.25,
    usage: { credits: 1 },
    ...extra,
  };
}

test("Tavily Crawl maps approved root, path scope, bounds and bearer auth", async () => {
  const calls = [];
  const g = gate();
  const provider = new TavilyAutomationCrawlProvider({
    apiKey: "tvly-secret",
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init, body: JSON.parse(String(init?.body ?? "{}")) });
      return json(payload([{ url: "https://example.sk/psy/max", raw_content: "# Max\nPes na adopciu." }]));
    },
  });

  const result = await provider.crawl({ source: source(), contract: contract(), gate: g.value });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, TAVILY_CRAWL_ENDPOINT);
  assert.equal(new Headers(calls[0].init.headers).get("authorization"), "Bearer tvly-secret");
  assert.equal(calls[0].body.url, "https://example.sk/psy");
  assert.equal(calls[0].body.max_depth, 3);
  assert.equal(calls[0].body.max_breadth, 20);
  assert.equal(calls[0].body.limit, 10);
  assert.deepEqual(calls[0].body.select_paths, ["^/psy(?:/.*)?$"]);
  assert.deepEqual(calls[0].body.exclude_paths, ["^/psy/archiv(?:/.*)?$"]);
  assert.deepEqual(calls[0].body.select_domains, ["^example\\.sk$"]);
  assert.equal(calls[0].body.allow_external, false);
  assert.equal(calls[0].body.format, "markdown");
  assert.equal(calls[0].body.include_usage, true);
  assert.equal(result.coverage.classification, "BOUNDED_PARTIAL");
  assert.equal(result.coverage.complete, false);
  assert.equal(result.records[0].extraction.strategy, "TAVILY_CRAWL");
  assert.equal(result.records[0].sourceUrl, "https://example.sk/psy/max");
  assert.equal(g.finalized[0].status, "SUCCESS");
});

test("Tavily Crawl filters duplicates, external origins, excluded paths and invalid protocols after provider response", async () => {
  const g = gate();
  const provider = new TavilyAutomationCrawlProvider({
    apiKey: "key",
    fetchImpl: async () => json(payload([
      { url: "https://example.sk/psy/max", raw_content: "# Max" },
      { url: "https://example.sk/psy/max", raw_content: "# Max duplicate" },
      { url: "https://partner.example/psy/max", raw_content: "# External" },
      { url: "https://example.sk/akcie/event", raw_content: "# Event" },
      { url: "https://example.sk/psy/archiv/old", raw_content: "# Old" },
      { url: "ftp://example.sk/psy/bad", raw_content: "# Bad" },
    ])),
  });
  const result = await provider.crawl({ source: source(), contract: contract(), gate: g.value });
  assert.equal(result.records.length, 1);
  assert.equal(result.diagnostics.duplicateCount, 1);
  assert.equal(result.diagnostics.scopeRejectedCount, 3);
  assert.ok(result.diagnostics.invalidCount >= 1);
});

test("Tavily Crawl never reports COMPLETE_ENUMERATION, even on a small completed-looking response", async () => {
  const provider = new TavilyAutomationCrawlProvider({
    apiKey: "key",
    fetchImpl: async () => json(payload([{ url: "https://example.sk/psy/max", raw_content: "# Max" }])),
  });
  const result = await provider.crawl({ source: source(), contract: contract(), gate: gate().value });
  assert.equal(result.coverage.classification, "BOUNDED_PARTIAL");
  assert.equal(result.coverage.complete, false);
  assert.equal(automationCoverageCanInferAbsence(result.coverage), false);
});

test("Tavily Crawl auth failure is stable and does not leak the API key", async () => {
  const secret = "tvly-super-secret";
  const provider = new TavilyAutomationCrawlProvider({
    apiKey: secret,
    fetchImpl: async () => json({ detail: secret }, 401),
  });
  await assert.rejects(
    provider.crawl({ source: source(), contract: contract(), gate: gate().value }),
    (error) => error instanceof TavilySourceScopedError
      && error.code === "TAVILY_AUTH_FAILED"
      && !error.message.includes(secret),
  );
});

test("Tavily Crawl timeout is bounded", async () => {
  let calls = 0;
  const provider = new TavilyAutomationCrawlProvider({
    apiKey: "key",
    fetchImpl: async () => {
      calls += 1;
      const error = new Error("timeout");
      error.name = "AbortError";
      throw error;
    },
  });
  await assert.rejects(
    provider.crawl({ source: source(), contract: contract(), gate: gate().value }),
    (error) => error instanceof TavilySourceScopedError && error.code === "TAVILY_TIMEOUT",
  );
  assert.equal(calls, 1);
});

test("Tavily Crawl 429 is not immediately retried", async () => {
  let calls = 0;
  const provider = new TavilyAutomationCrawlProvider({
    apiKey: "key",
    fetchImpl: async () => {
      calls += 1;
      return json({}, 429);
    },
    sleep: async () => {},
  });
  await assert.rejects(
    provider.crawl({
      source: source({ retryMaxAttempts: 2 }),
      contract: contract(),
      gate: gate().value,
    }),
    (error) => error instanceof TavilySourceScopedError && error.code === "TAVILY_RATE_LIMITED",
  );
  assert.equal(calls, 1);
});

test("Tavily Crawl retries transient 5xx only within the source retry bound", async () => {
  let calls = 0;
  let sleeps = 0;
  const provider = new TavilyAutomationCrawlProvider({
    apiKey: "key",
    fetchImpl: async () => {
      calls += 1;
      if (calls < 3) return json({}, 500);
      return json(payload([{ url: "https://example.sk/psy/max", raw_content: "# Max" }]));
    },
    sleep: async () => { sleeps += 1; },
  });
  const result = await provider.crawl({
    source: source({ retryMaxAttempts: 2 }),
    contract: contract(),
    gate: gate().value,
  });
  assert.equal(result.records.length, 1);
  assert.equal(calls, 3);
  assert.equal(sleeps, 2);
});

test("Tavily Crawl rejects malformed response schema", async () => {
  const provider = new TavilyAutomationCrawlProvider({
    apiKey: "key",
    fetchImpl: async () => json({ response_time: 1 }),
  });
  await assert.rejects(
    provider.crawl({ source: source(), contract: contract(), gate: gate().value }),
    (error) => error instanceof TavilySourceScopedError && error.code === "TAVILY_INVALID_RESPONSE",
  );
});

test("Tavily provider retains only bounded normalized fields and raw excerpt", async () => {
  const long = "# Max\n" + "detail ".repeat(40000);
  const provider = new TavilyAutomationCrawlProvider({
    apiKey: "key",
    fetchImpl: async () => json(payload([{ url: "https://example.sk/psy/max", raw_content: long }])),
  });
  const result = await provider.crawl({ source: source(), contract: contract(), gate: gate().value });
  const record = result.records[0];
  assert.ok(String(record.rawRecord.contentExcerpt).length <= 4000);
  assert.ok(String(record.proposed.description).length <= 5000);
  assert.equal("raw_content" in record.rawRecord, false);
});

test("Tavily DIRECTORY public-content gate removes navigation/footer boilerplate but keeps raw evidence", async () => {
  const src = source({
    entityType: "DIRECTORY",
    sourceUrl: "https://example.sk/",
    config: {
      sourceShape: "SINGLE_ITEM",
      staticFields: {
        category: "psie-sluzby",
        semanticKind: "FACILITY_OR_SERVICE_PROFILE",
      },
    },
  });
  const rawContent = [
    "![Image 1: PSIA ŠKOLA a HOTEL](...)",
    "Skip to content",
    "![Image 2: psia skola hotel favicon](...)",
    "[](javascript:void(0))",
    "Úvod",
    "O nás",
    "Služby",
    "Cenník",
    "Rezervácia",
    "",
    "PSIA ŠKOLA a HOTEL",
    "",
    "Ponúkame individuálny výcvik psov a ubytovanie psov.",
    "Výcvik prispôsobujeme potrebám psa a majiteľa.",
    "",
    "Kontakt",
    "+421 900 000 000",
    "info@example.sk",
    "",
    "Facebook",
    "Instagram",
    "",
    "Všeobecné obchodné podmienky",
    "Reklamačný poriadok",
    "Ochrana osobných údajov",
  ].join("\n");
  const provider = new TavilyAutomationExtractProvider({
    apiKey: "key",
    fetchImpl: async () => json(payload([{ url: src.sourceUrl, raw_content: rawContent }])),
  });

  const result = await provider.extract({
    source: src,
    contract: contract(src, "include:/**"),
    gate: gate().value,
    urls: [src.sourceUrl],
  });
  const record = result.records[0];

  assert.equal(record.proposed.name, "PSIA ŠKOLA a HOTEL");
  assert.equal(
    record.proposed.description,
    "Ponúkame individuálny výcvik psov a ubytovanie psov. Výcvik prispôsobujeme potrebám psa a majiteľa.",
  );
  assert.equal(record.proposed.excerpt, record.proposed.description);
  assert.equal(record.rawRecord.contentQuality.nameAccepted, true);
  assert.equal(record.rawRecord.contentQuality.descriptionAccepted, true);
  assert.equal(record.rawRecord.contentQuality.descriptionReason, "quality_approved");
  assert.ok(record.rawRecord.contentQuality.boilerplateSegmentsDropped >= 10);
  assert.match(record.rawRecord.contentExcerpt, /Skip to content/);
  assert.doesNotMatch(record.proposed.description, /javascript|Facebook|Instagram|Reklamačný|Ochrana osobných údajov/i);
});

test("Tavily DIRECTORY keeps usable identity/URL when no quality-approved description exists", async () => {
  const src = source({
    entityType: "DIRECTORY",
    sourceUrl: "https://example.sk/",
    config: {
      sourceShape: "SINGLE_ITEM",
      staticFields: {
        category: "psie-sluzby",
        semanticKind: "FACILITY_OR_SERVICE_PROFILE",
      },
    },
  });
  const provider = new TavilyAutomationExtractProvider({
    apiKey: "key",
    fetchImpl: async () => json(payload([{
      url: src.sourceUrl,
      raw_content: "# Psia škola ABC\nMenu\nKontakt\nFacebook\nGDPR",
    }])),
  });

  const result = await provider.extract({
    source: src,
    contract: contract(src, "include:/**"),
    gate: gate().value,
    urls: [src.sourceUrl],
  });
  const record = result.records[0];

  assert.equal(record.proposed.name, "Psia škola ABC");
  assert.equal(record.proposed.websiteUrl, src.sourceUrl);
  assert.equal(Object.hasOwn(record.proposed, "description"), false);
  assert.equal(Object.hasOwn(record.proposed, "excerpt"), false);
  assert.equal(record.rawRecord.contentQuality.descriptionAccepted, false);
  assert.equal(record.rawRecord.contentQuality.descriptionReason, "no_prose_segments");
});

test("Tavily Extract sends one approved detail URL and maps DETAIL_ONLY evidence", async () => {
  const src = source({
    sourceUrl: "https://example.sk/psy/max",
    config: { sourceShape: "SINGLE_ITEM" },
  });
  const scoped = contract(src, "/psy/**");
  const calls = [];
  const provider = new TavilyAutomationExtractProvider({
    apiKey: "key",
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
      return json(payload([{ url: src.sourceUrl, raw_content: "# Max\nDetail psa." }]));
    },
  });
  const result = await provider.extract({
    source: src,
    contract: scoped,
    gate: gate().value,
    urls: [src.sourceUrl],
  });
  assert.equal(calls[0].url, TAVILY_EXTRACT_ENDPOINT);
  assert.deepEqual(calls[0].body.urls, [src.sourceUrl]);
  assert.equal(result.coverage.classification, "DETAIL_ONLY");
  assert.equal(result.coverage.complete, false);
  assert.equal(result.records[0].extraction.strategy, "TAVILY_EXTRACT");
});

test("Tavily Extract bounds a batch to current API maximum of 20 URLs", async () => {
  const src = source({ maxRecordsPerRun: 50 });
  const urls = Array.from({ length: 25 }, (_, i) => "https://example.sk/psy/dog-" + i);
  let body;
  const provider = new TavilyAutomationExtractProvider({
    apiKey: "key",
    fetchImpl: async (_url, init) => {
      body = JSON.parse(String(init?.body ?? "{}"));
      return json(payload(body.urls.map((url) => ({ url, raw_content: "# Dog" }))));
    },
  });
  const result = await provider.extract({ source: src, contract: contract(src), gate: gate().value, urls });
  assert.equal(body.urls.length, 20);
  assert.equal(result.records.length, 20);
  assert.equal(result.coverage.classification, "DETAIL_ONLY");
  assert.equal(result.coverage.truncated, true);
});

test("Tavily Extract rejects an outside-scope URL before provider network call", async () => {
  let calls = 0;
  const provider = new TavilyAutomationExtractProvider({
    apiKey: "key",
    fetchImpl: async () => { calls += 1; return json(payload([])); },
  });
  await assert.rejects(
    provider.extract({
      source: source(),
      contract: contract(),
      gate: gate().value,
      urls: ["https://example.sk/akcie/event"],
    }),
    (error) => error instanceof TavilySourceScopedError && error.code === "TAVILY_SCOPE_VIOLATION",
  );
  assert.equal(calls, 0);
});

test("Tavily Extract rejects external origin before provider network call", async () => {
  let calls = 0;
  const provider = new TavilyAutomationExtractProvider({
    apiKey: "key",
    fetchImpl: async () => { calls += 1; return json(payload([])); },
  });
  await assert.rejects(
    provider.extract({
      source: source(),
      contract: contract(),
      gate: gate().value,
      urls: ["https://other.example/psy/max"],
    }),
    TavilySourceScopedError,
  );
  assert.equal(calls, 0);
});

test("Tavily Extract tolerates partial batch failure when usable scoped results remain", async () => {
  const provider = new TavilyAutomationExtractProvider({
    apiKey: "key",
    fetchImpl: async () => json(payload(
      [{ url: "https://example.sk/psy/max", raw_content: "# Max" }],
      { failed_results: [{ url: "https://example.sk/psy/rex", error: "blocked" }] },
    )),
  });
  const result = await provider.extract({
    source: source(),
    contract: contract(),
    gate: gate().value,
    urls: ["https://example.sk/psy/max", "https://example.sk/psy/rex"],
  });
  assert.equal(result.records.length, 1);
  assert.equal(result.diagnostics.failedCount, 1);
});

test("Tavily Extract timeout and rate limit stay bounded with no 429 retry storm", async () => {
  for (const mode of ["timeout", "rate"]) {
    let calls = 0;
    const provider = new TavilyAutomationExtractProvider({
      apiKey: "key",
      fetchImpl: async () => {
        calls += 1;
        if (mode === "rate") return json({}, 429);
        const error = new Error("timeout");
        error.name = "AbortError";
        throw error;
      },
      sleep: async () => {},
    });
    await assert.rejects(
      provider.extract({
        source: source({ retryMaxAttempts: 2 }),
        contract: contract(),
        gate: gate().value,
        urls: ["https://example.sk/psy/max"],
      }),
      (error) => error instanceof TavilySourceScopedError
        && (error.code === "TAVILY_RATE_LIMITED" || error.code === "TAVILY_TIMEOUT"),
    );
    assert.equal(calls, mode === "rate" ? 1 : 3);
  }
});

test("same Tavily detail URL produces a stable provider-neutral sourceRecordId", async () => {
  const make = () => new TavilyAutomationExtractProvider({
    apiKey: "key",
    fetchImpl: async () => json(payload([{ url: "https://example.sk/psy/max", raw_content: "# Max" }])),
  });
  const first = await make().extract({
    source: source(),
    contract: contract(),
    gate: gate().value,
    urls: ["https://example.sk/psy/max"],
  });
  const second = await make().extract({
    source: source(),
    contract: contract(),
    gate: gate().value,
    urls: ["https://example.sk/psy/max"],
  });
  assert.equal(first.records[0].sourceRecordId, second.records[0].sourceRecordId);
  assert.match(first.records[0].sourceRecordId, /^url:/);
  assert.equal(first.records[0].extraction.evidenceMetadata.provider, "tavily");
});

test("provider budget denial prevents network request", async () => {
  let calls = 0;
  const provider = new TavilyAutomationCrawlProvider({
    apiKey: "key",
    fetchImpl: async () => { calls += 1; return json(payload([])); },
  });
  await assert.rejects(
    provider.crawl({ source: source(), contract: contract(), gate: gate(false).value }),
    (error) => error instanceof TavilySourceScopedError && error.code === "TAVILY_BUDGET_EXHAUSTED",
  );
  assert.equal(calls, 0);
});

test("Tavily Crawl and Extract coverage can never drive missing semantics", async () => {
  assert.equal(automationCoverageCanInferAbsence({ classification: "RANKED_SEARCH", complete: false }), false);
  assert.equal(automationCoverageCanInferAbsence({ classification: "BOUNDED_PARTIAL", complete: false }), false);
  assert.equal(automationCoverageCanInferAbsence({ classification: "DETAIL_ONLY", complete: false }), false);
});


test("transient retry consumes a fresh budget reservation before each HTTP attempt", async () => {
  let fetches = 0;
  let reservations = 0;
  const finalized = [];
  const provider = new TavilyAutomationCrawlProvider({
    apiKey: "key",
    sleep: async () => {},
    fetchImpl: async () => {
      fetches += 1;
      return json({}, 503);
    },
  });
  await assert.rejects(
    provider.crawl({
      source: source({ retryMaxAttempts: 2 }),
      contract: contract(),
      gate: {
        async reserve(operation) {
          reservations += 1;
          return reservations === 1 ? { operationKey: "attempt-1-" + operation } : null;
        },
        async finalize(value) {
          finalized.push(value);
        },
      },
    }),
    (error) => error instanceof TavilySourceScopedError && error.code === "TAVILY_BUDGET_EXHAUSTED",
  );
  assert.equal(fetches, 1);
  assert.equal(reservations, 2);
  assert.equal(finalized[0].status, "PROVIDER_ERROR");
});

test("all scope-rejected Crawl results finalize as scope violation", async () => {
  const g = gate();
  const provider = new TavilyAutomationCrawlProvider({
    apiKey: "key",
    fetchImpl: async () => json(payload([
      { url: "https://other.example/psy/max", raw_content: "# Max" },
      { url: "https://example.sk/blog/max", raw_content: "# Max" },
    ])),
  });
  await assert.rejects(
    provider.crawl({ source: source(), contract: contract(), gate: g.value }),
    (error) => error instanceof TavilySourceScopedError && error.code === "TAVILY_SCOPE_VIOLATION",
  );
  assert.equal(g.finalized.at(-1).status, "SCOPE_VIOLATION");
});

test("malformed provider response finalizes reserved usage as INVALID_RESPONSE", async () => {
  const g = gate();
  const provider = new TavilyAutomationExtractProvider({
    apiKey: "key",
    fetchImpl: async () => json({ unexpected: [] }),
  });
  await assert.rejects(
    provider.extract({
      source: source(),
      contract: contract(),
      gate: g.value,
      urls: ["https://example.sk/psy/max"],
    }),
    (error) => error instanceof TavilySourceScopedError && error.code === "TAVILY_INVALID_RESPONSE",
  );
  assert.equal(g.finalized.at(-1).status, "INVALID_RESPONSE");
});


test("Tavily Crawl preserves static fields and expands mushing-style markdown rows into stable EVENT records", async () => {
  const src = source({
    entityType: "EVENT",
    sourceKey: "mushing-events",
    sourceUrl: "https://mushing.sk/preteky",
    config: {
      sourceShape: "MULTI_ITEM_LIST",
      staticFields: { eventType: "Preteky" },
    },
    maxRecordsPerRun: 50,
  });
  const scoped = contract(src, "/preteky/**");
  const calls = [];
  const provider = new TavilyAutomationCrawlProvider({
    apiKey: "key",
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
      return json(payload([{
        url: "https://mushing.sk/preteky",
        raw_content: [
          "# Preteky",
          "| 12.–13.09.2026 | Pezinská baba | Pezinská baba | PROPOZÍCIE |",
          "| 20.09.2026 | Haniska | Haniska | Prihláška |",
          "| 31.10.–1.11.2026 | Mošovce | Mošovce | REGISTRÁCIE |",
        ].join("\n"),
      }]));
    },
  });

  const result = await provider.crawl({ source: src, contract: scoped, gate: gate().value });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, TAVILY_CRAWL_ENDPOINT);
  assert.equal(calls[0].body.extract_depth, "advanced");
  assert.equal(result.records.length, 3);
  assert.deepEqual(result.records.map((record) => record.proposed.title), [
    "Pezinská baba",
    "Haniska",
    "Mošovce",
  ]);
  assert.ok(result.records.every((record) => record.proposed.eventType === "Preteky"));
  assert.ok(result.records.every((record) => /^tavily-row:/.test(record.sourceRecordId)));

  const normalized = result.records.map((record) =>
    normalizeAutomationEventRecord(record, { now: new Date("2026-08-01T00:00:00.000Z") })
  );
  assert.deepEqual(normalized.map((record) => record.proposed.startDate), [
    "2026-09-12",
    "2026-09-20",
    "2026-10-31",
  ]);
  assert.deepEqual(normalized.map((record) => record.proposed.endDate ?? null), [
    "2026-09-13",
    null,
    "2026-11-01",
  ]);
  for (const record of normalized) {
    const decision = validateDynamicAutomationIngestion({ source: src, record });
    assert.equal(decision?.gate, "VALID_FOR_DRAFT");
    assert.equal(decision?.stableIdentity, "SOURCE_RECORD_ID");
    assert.equal(decision?.evidenceClasses.includes("CANONICAL_DETAIL_URL"), false);
  }
});

test("Tavily Extract marks exact provider-delivered entity page fields as first-party evidence and keeps static category", async () => {
  const src = source({
    entityType: "DIRECTORY",
    sourceKey: "vet-profile",
    sourceUrl: "https://vet.example.sk/",
    config: {
      sourceShape: "SINGLE_ITEM",
      htmlAdapterKey: "generic-directory-profile",
      expectedMinRecords: 1,
      staticFields: {
        category: "veterinari",
        semanticKind: "FACILITY_OR_SERVICE_PROFILE",
      },
    },
  });
  const scoped = contract(src, null);
  const provider = new TavilyAutomationExtractProvider({
    apiKey: "key",
    fetchImpl: async () => json(payload([{
      url: src.sourceUrl,
      raw_content: "# HappyVet Nitra\nAdresa: Mostná 12, 949 01 Nitra",
    }])),
  });
  const result = await provider.extract({
    source: src,
    contract: scoped,
    gate: gate().value,
    urls: [src.sourceUrl],
  });
  const record = result.records[0];
  assert.equal(record.proposed.category, "veterinari");
  assert.equal(record.proposed.semanticKind, "FACILITY_OR_SERVICE_PROFILE");
  assert.equal(record.rawRecord.identitySource, "TAVILY_EXTRACT_FIRST_PARTY");
  assert.equal(record.rawRecord.directEvidence.fieldOrigins.name, "FIRST_PARTY");
  assert.equal(record.rawRecord.directEvidence.fieldOrigins.websiteUrl, "FIRST_PARTY");
});


test("provider cooldown denial is reported as cooldown, not budget exhaustion", async () => {
  let calls = 0;
  const provider = new TavilyAutomationCrawlProvider({
    apiKey: "key",
    fetchImpl: async () => {
      calls += 1;
      return json(payload([]));
    },
  });
  await assert.rejects(
    provider.crawl({
      source: source(),
      contract: contract(),
      gate: {
        async reserve() {
          return { operationKey: "cooldown-op", blockedReason: "COOLDOWN" };
        },
        async finalize() {},
      },
    }),
    (error) => error instanceof TavilySourceScopedError && error.code === "TAVILY_COOLDOWN",
  );
  assert.equal(calls, 0);
});


test("Tavily Extract can recover a mushing-style EVENT list from the approved root page", async () => {
  const src = source({
    entityType: "EVENT",
    sourceKey: "mushing-events",
    sourceUrl: "https://mushing.sk/preteky",
    config: {
      sourceShape: "MULTI_ITEM_LIST",
      staticFields: { eventType: "Preteky" },
    },
    maxRecordsPerRun: 50,
  });
  const scoped = contract(src, "/preteky/**");
  const provider = new TavilyAutomationExtractProvider({
    apiKey: "key",
    fetchImpl: async () => json(payload([{
      url: "https://mushing.sk/preteky/",
      raw_content: [
        "# Preteky",
        "| 14.–18.10.2026 | ME IFSS Gävle | Gävle – Švédsko |",
        "| 31.10.–1.11.2026 | Mošovce | Mošovce | REGISTRÁCIE |",
      ].join("\n"),
    }])),
  });

  const result = await provider.extract({
    source: src,
    contract: scoped,
    gate: gate().value,
    urls: [src.sourceUrl],
  });

  assert.equal(result.records.length, 2);
  assert.deepEqual(result.records.map((record) => record.proposed.title), [
    "ME IFSS Gävle",
    "Mošovce",
  ]);
  assert.ok(result.records.every((record) => record.extraction.strategy === "TAVILY_EXTRACT"));
  assert.ok(result.records.every((record) => record.rawRecord.identitySource === "TAVILY_EXTRACT_LIST_ROW"));

  const normalized = result.records.map((record) =>
    normalizeAutomationEventRecord(record, { now: new Date("2026-10-06T00:00:00.000Z") })
  );
  assert.deepEqual(normalized.map((record) => record.proposed.startDate), [
    "2026-10-14",
    "2026-10-31",
  ]);
  assert.deepEqual(normalized.map((record) => record.proposed.endDate ?? null), [
    "2026-10-18",
    "2026-11-01",
  ]);
});


test("HTTP 500 keeps provider classification and finalizes bounded structured diagnostics", async () => {
  const g = gate();
  const provider = new TavilyAutomationCrawlProvider({
    apiKey: "key",
    fetchImpl: async () => json({
      error: { code: "upstream_error", message: "temporary upstream failure" },
      request_id: "req-500",
    }, 500),
  });
  await assert.rejects(
    provider.crawl({ source: source(), contract: contract(), gate: g.value }),
    (error) => error instanceof TavilySourceScopedError
      && error.code === "TAVILY_PROVIDER_ERROR"
      && error.retryable === true
      && error.message === "TAVILY_PROVIDER_ERROR"
      && error.diagnostics.providerHttpStatus === 500
      && error.diagnostics.providerErrorCode === "upstream_error"
      && error.diagnostics.providerRequestId === "req-500",
  );
  assert.equal(g.finalized.length, 1);
  assert.equal(g.finalized[0].status, "PROVIDER_ERROR");
  assert.equal(g.finalized[0].diagnostics.providerHttpStatus, 500);
  assert.equal(g.finalized[0].diagnostics.providerErrorDetail, "temporary upstream failure");
});

test("HTTP 500 parses Tavily nested detail.error without changing retry semantics", async () => {
  const g = gate();
  const provider = new TavilyAutomationCrawlProvider({
    apiKey: "key",
    fetchImpl: async () => json({
      detail: { error: "[500] Internal server error" },
    }, 500),
  });
  await assert.rejects(
    provider.crawl({ source: source(), contract: contract(), gate: g.value }),
    (error) => error instanceof TavilySourceScopedError
      && error.code === "TAVILY_PROVIDER_ERROR"
      && error.retryable === true
      && error.diagnostics.providerHttpStatus === 500
      && error.diagnostics.providerErrorDetail === "[500] Internal server error"
      && error.diagnostics.transportPhase === "RESPONSE_HEADERS",
  );
  assert.equal(g.finalized[0].status, "PROVIDER_ERROR");
  assert.equal(g.finalized[0].diagnostics.providerHttpStatus, 500);
  assert.equal(g.finalized[0].diagnostics.providerErrorDetail, "[500] Internal server error");
  assert.equal(g.finalized[0].diagnostics.transportPhase, "RESPONSE_HEADERS");
});

test("HTTP 400 is non-retryable but persists its provider diagnostics", async () => {
  let calls = 0;
  const g = gate();
  const provider = new TavilyAutomationCrawlProvider({
    apiKey: "key",
    sleep: async () => {},
    fetchImpl: async () => {
      calls += 1;
      return json({ detail: "invalid parameter", code: "validation_error" }, 400);
    },
  });
  await assert.rejects(
    provider.crawl({
      source: source({ retryMaxAttempts: 2 }),
      contract: contract(),
      gate: g.value,
    }),
    (error) => error instanceof TavilySourceScopedError
      && error.code === "TAVILY_PROVIDER_ERROR"
      && error.retryable === false
      && error.diagnostics.providerHttpStatus === 400,
  );
  assert.equal(calls, 1);
  assert.equal(g.finalized.length, 1);
  assert.equal(g.finalized[0].diagnostics.providerErrorCode, "validation_error");
});

test("HTTP auth and rate-limit classifications stay unchanged while retaining HTTP status", async () => {
  for (const [status, code] of [
    [401, "TAVILY_AUTH_FAILED"],
    [403, "TAVILY_AUTH_FAILED"],
    [429, "TAVILY_RATE_LIMITED"],
  ]) {
    let calls = 0;
    const g = gate();
    const provider = new TavilyAutomationCrawlProvider({
      apiKey: "key",
      sleep: async () => {},
      fetchImpl: async () => {
        calls += 1;
        return json({ detail: "provider rejected request" }, status);
      },
    });
    await assert.rejects(
      provider.crawl({
        source: source({ retryMaxAttempts: 2 }),
        contract: contract(),
        gate: g.value,
      }),
      (error) => error instanceof TavilySourceScopedError
        && error.code === code
        && error.diagnostics.providerHttpStatus === status,
    );
    assert.equal(calls, 1);
    assert.equal(g.finalized[0].diagnostics.providerHttpStatus, status);
  }
});

test("network failure records only safe transport name and scalar cause code", async () => {
  const g = gate();
  const provider = new TavilyAutomationCrawlProvider({
    apiKey: "key",
    fetchImpl: async () => {
      const error = new TypeError("socket failed with sensitive free-form text");
      error.cause = { code: "ECONNRESET", detail: "must-not-be-persisted" };
      throw error;
    },
  });
  await assert.rejects(
    provider.crawl({ source: source(), contract: contract(), gate: g.value }),
    (error) => error instanceof TavilySourceScopedError
      && error.code === "TAVILY_PROVIDER_ERROR"
      && error.retryable === true
      && error.diagnostics.providerHttpStatus == null
      && error.diagnostics.transportPhase === "FETCH"
      && error.diagnostics.transportErrorName === "TypeError"
      && error.diagnostics.transportErrorCode === "ECONNRESET"
      && error.diagnostics.providerErrorDetail == null,
  );
  assert.equal(g.finalized[0].diagnostics.providerHttpStatus, null);
  assert.equal(g.finalized[0].diagnostics.transportPhase, "FETCH");
  assert.equal(g.finalized[0].diagnostics.transportErrorName, "TypeError");
  assert.equal(g.finalized[0].diagnostics.transportErrorCode, "ECONNRESET");
  assert.equal("message" in g.finalized[0].diagnostics, false);
});

test("HTTP 200 body-read TypeError preserves status and records SUCCESS_BODY_READ phase", async () => {
  const g = gate();
  const provider = new TavilyAutomationCrawlProvider({
    apiKey: "key",
    fetchImpl: async () => new Response(new ReadableStream({
      start(controller) {
        controller.error(new TypeError("body stream failed"));
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  });

  await assert.rejects(
    provider.crawl({ source: source(), contract: contract(), gate: g.value }),
    (error) => error instanceof TavilySourceScopedError
      && error.code === "TAVILY_PROVIDER_ERROR"
      && error.retryable === true
      && error.diagnostics.providerHttpStatus === 200
      && error.diagnostics.transportPhase === "SUCCESS_BODY_READ"
      && error.diagnostics.transportErrorName === "TypeError"
      && error.diagnostics.transportErrorCode === "BODY_STREAM_ERROR",
  );
  assert.equal(g.finalized[0].status, "PROVIDER_ERROR");
  assert.equal(g.finalized[0].diagnostics.providerHttpStatus, 200);
  assert.equal(g.finalized[0].diagnostics.transportPhase, "SUCCESS_BODY_READ");
  assert.equal(g.finalized[0].diagnostics.transportErrorName, "TypeError");
});

test("HTTP 200 invalid JSON stays INVALID_RESPONSE with known status and JSON_PARSE phase", async () => {
  const g = gate();
  const provider = new TavilyAutomationCrawlProvider({
    apiKey: "key",
    fetchImpl: async () => new Response("{not-json", {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  });
  await assert.rejects(
    provider.crawl({ source: source(), contract: contract(), gate: g.value }),
    (error) => error instanceof TavilySourceScopedError
      && error.code === "TAVILY_INVALID_RESPONSE"
      && error.retryable === false
      && error.diagnostics.providerHttpStatus === 200
      && error.diagnostics.transportPhase === "JSON_PARSE",
  );
  assert.equal(g.finalized[0].status, "INVALID_RESPONSE");
  assert.equal(g.finalized[0].diagnostics.providerHttpStatus, 200);
  assert.equal(g.finalized[0].diagnostics.transportPhase, "JSON_PARSE");
});

test("provider diagnostics redact echoed credentials before error or persistence surfaces", async () => {
  const secret = "tvly-super-secret";
  const g = gate();
  const provider = new TavilyAutomationCrawlProvider({
    apiKey: secret,
    fetchImpl: async () => json({
      detail: `Authorization: Bearer ${secret}`,
      error: { code: `bad-${secret}`, message: secret },
      request_id: `req-${secret}`,
    }, 500),
  });
  let thrown;
  try {
    await provider.crawl({ source: source(), contract: contract(), gate: g.value });
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown instanceof TavilySourceScopedError);
  const diagnosticJson = JSON.stringify(thrown.diagnostics);
  const persistedJson = JSON.stringify(g.finalized[0].diagnostics);
  assert.equal(diagnosticJson.includes(secret), false);
  assert.equal(persistedJson.includes(secret), false);
  assert.equal(thrown.message.includes(secret), false);
  assert.equal(diagnosticJson.includes("Authorization: Bearer " + secret), false);
});

test("oversized or malformed provider error bodies never replace the original HTTP classification", async () => {
  for (const responseFactory of [
    () => new Response(JSON.stringify({ detail: "x".repeat(5000) }), {
      status: 500,
      headers: { "content-type": "application/json", "content-length": "6000" },
    }),
    () => new Response("{malformed", {
      status: 500,
      headers: { "content-type": "application/json" },
    }),
  ]) {
    const g = gate();
    const provider = new TavilyAutomationCrawlProvider({
      apiKey: "key",
      fetchImpl: async () => responseFactory(),
    });
    await assert.rejects(
      provider.crawl({ source: source(), contract: contract(), gate: g.value }),
      (error) => error instanceof TavilySourceScopedError
        && error.code === "TAVILY_PROVIDER_ERROR"
        && error.retryable === true
        && error.diagnostics.providerHttpStatus === 500,
    );
    assert.equal(g.finalized[0].status, "PROVIDER_ERROR");
    assert.equal(g.finalized[0].diagnostics.providerHttpStatus, 500);
  }
});

test("each transient retry finalizes its own diagnostics row", async () => {
  let calls = 0;
  const g = gate();
  const provider = new TavilyAutomationCrawlProvider({
    apiKey: "key",
    sleep: async () => {},
    fetchImpl: async () => {
      calls += 1;
      return json({
        code: "upstream_error",
        request_id: "req-" + calls,
      }, 503);
    },
  });
  await assert.rejects(
    provider.crawl({
      source: source({ retryMaxAttempts: 2 }),
      contract: contract(),
      gate: g.value,
    }),
    (error) => error instanceof TavilySourceScopedError && error.code === "TAVILY_PROVIDER_ERROR",
  );
  assert.equal(calls, 3);
  assert.equal(g.reservations.length, 3);
  assert.equal(g.finalized.length, 3);
  assert.deepEqual(
    g.finalized.map((attempt) => attempt.diagnostics.providerRequestId),
    ["req-1", "req-2", "req-3"],
  );
  assert.ok(g.finalized.every((attempt) => attempt.diagnostics.providerHttpStatus === 503));
  assert.ok(g.finalized.every((attempt) => attempt.diagnostics.transportPhase === "RESPONSE_HEADERS"));
});
