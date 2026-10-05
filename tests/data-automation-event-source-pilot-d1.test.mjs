import assert from "node:assert/strict";
import test from "node:test";
import { getPlatformProxy } from "wrangler";
import { runAutomationSourceNow } from "../lib/data-automation-runner.ts";

const SOURCE_KEY = "event-pilot-local-d1";
const TITLE = "Local D1 Výstava ABC";
const ROOT_URL = "https://events.example.sk/events";
const DETAIL_URL = "https://events.example.sk/events/local-d1-vystava-abc";
const NOW = new Date("2026-10-05T12:00:00.000Z");

function fixtureHtml() {
  return `<!doctype html>
  <html>
    <head>
      <script type="application/ld+json">
      ${JSON.stringify({
        "@context": "https://schema.org",
        "@type": "ItemList",
        itemListElement: [{
          "@type": "ListItem",
          position: 1,
          item: {
            "@type": "Event",
            "@id": "evt-local-d1-1",
            name: TITLE,
            startDate: "2027-03-10T09:30:00+01:00",
            endDate: "2027-03-10T16:00:00+01:00",
            url: DETAIL_URL,
            organizer: { "@type": "Organization", name: "Klub ABC" },
            location: {
              "@type": "Place",
              name: "Agrokomplex, Nitra",
              address: {
                "@type": "PostalAddress",
                streetAddress: "Výstavná 4",
                postalCode: "949 01",
                addressLocality: "Nitra",
                addressRegion: "Nitriansky kraj",
              },
            },
          },
        }],
      })}
      </script>
    </head>
    <body><a href="${DETAIL_URL}">${TITLE}</a></body>
  </html>`;
}

test("approved generic EVENT source runs end-to-end on isolated local D1 and is idempotent", async (t) => {
  const proxy = await getPlatformProxy({
    configPath: "dist/server/wrangler.json",
    persist: { path: ".wrangler/state/v3" },
  });
  t.after(async () => {
    await proxy.dispose();
  });

  const db = proxy.env.DB;
  assert.ok(db?.prepare, "local D1 DB binding must be available");

  await db.prepare("DELETE FROM automation_sources WHERE source_key=?").bind(SOURCE_KEY).run();
  await db.prepare("DELETE FROM managed_events WHERE title=?").bind(TITLE).run();

  const inserted = await db.prepare(`INSERT INTO automation_sources (
      source_key,label,entity_type,connector_type,source_url,config_json,enabled,
      cadence_minutes,throttle_ms,timeout_ms,retry_max_attempts,retry_backoff_ms,max_records_per_run,
      next_check_at,created_at,updated_at,review_status,reviewed_at,reviewed_by,review_notes
    ) VALUES (?,?,?,?,?,?,1,1440,0,5000,0,100,10,NULL,?,?, 'APPROVED',?,?,?)
    RETURNING id`).bind(
      SOURCE_KEY,
      "EVENT pilot local D1",
      "EVENT",
      "CONTROLLED_HTML",
      ROOT_URL,
      JSON.stringify({ sourceShape: "MULTI_ITEM_LIST" }),
      NOW.toISOString(),
      NOW.toISOString(),
      NOW.toISOString(),
      "event-source-scoped-pilot-test",
      "Deterministic local D1 pilot fixture.",
    ).first();
  const sourceId = Number(inserted?.id ?? 0);
  assert.ok(sourceId > 0);

  await db.prepare(`INSERT INTO automation_governance_reviews (
      subject_type,subject_id,access_status,robots_status,terms_status,recurring_status,retention_status,
      retain_url,retain_title,retain_snippet,retain_metadata,retention_days,min_cadence_minutes,max_requests_per_day,
      manual_only,path_scope,restrictions_note,terms_url,privacy_url,robots_url,evidence_url,
      reviewed_at,reviewed_by,rationale,expires_at,review_due_at,created_at,updated_at
    ) VALUES (
      'AUTOMATION_SOURCE',?,'ALLOWED','NOT_APPLICABLE','ALLOWED','APPROVED','APPROVED',
      1,0,0,1,NULL,NULL,20,0,'/events/**',NULL,NULL,NULL,NULL,NULL,
      ?,?,'Deterministic local D1 EVENT pilot.',NULL,NULL,?,?
    )`).bind(
      sourceId,
      NOW.toISOString(),
      "event-source-scoped-pilot-test",
      NOW.toISOString(),
      NOW.toISOString(),
    ).run();

  const fetchImpl = async (input) => {
    const value = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
    assert.ok(value === ROOT_URL || value === DETAIL_URL, "generic extraction must stay inside approved EVENT scope");
    return new Response(fixtureHtml(), {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  };

  const first = await runAutomationSourceNow(sourceId, {
    database: db,
    now: NOW,
    fetchImpl,
    sleep: async () => {},
  });

  assert.equal(first.status, "SUCCESS");
  assert.equal(first.checked, 1);
  assert.equal(first.newFindings, 1);
  assert.equal(first.draftCreated, 1);
  assert.equal(first.reviewOnly, 0);
  assert.equal(first.errors, 0);

  const canonical = await db.prepare(
    "SELECT id,status,start_date,start_time,city,organizer,website_url FROM managed_events WHERE title=? ORDER BY id DESC LIMIT 1",
  ).bind(TITLE).first();
  assert.ok(Number(canonical?.id ?? 0) > 0);
  assert.equal(canonical.status, "draft");
  assert.equal(canonical.start_date, "2027-03-10");
  assert.equal(canonical.start_time, "09:30");
  assert.equal(canonical.city, "Nitra");
  assert.equal(canonical.organizer, "Klub ABC");
  assert.equal(canonical.website_url, DETAIL_URL);

  const receipt = await db.prepare(`SELECT source_record_id,source_url,result
    FROM automation_ingestion_receipts
    WHERE source_id=? AND entity_type='EVENT' LIMIT 1`).bind(sourceId).first();
  assert.ok(String(receipt?.source_record_id ?? "").length > 0);
  assert.equal(receipt.source_url, DETAIL_URL);
  assert.equal(receipt.result, "DRAFT_CREATED");

  const provenance = await db.prepare(`SELECT external_source_url,external_record_id,provenance_type
    FROM canonical_external_provenance
    WHERE entity_type='EVENT' AND canonical_entity_id=? LIMIT 1`).bind(canonical.id).first();
  assert.equal(provenance?.external_source_url, DETAIL_URL);
  assert.equal(provenance?.external_record_id, receipt.source_record_id);
  assert.equal(provenance?.provenance_type, "AUTOMATION_SOURCE_RECORD");

  const second = await runAutomationSourceNow(sourceId, {
    database: db,
    now: new Date("2026-10-05T12:01:00.000Z"),
    fetchImpl,
    sleep: async () => {},
  });

  assert.equal(second.status, "SUCCESS");
  assert.equal(second.checked, 1);
  assert.equal(second.draftCreated, 0);
  assert.equal(second.reviewOnly, 0);
  assert.equal(second.errors, 0);

  const canonicalCount = await db.prepare("SELECT COUNT(*) AS count FROM managed_events WHERE title=?").bind(TITLE).first();
  const receiptCount = await db.prepare(`SELECT COUNT(*) AS count FROM automation_ingestion_receipts
    WHERE source_id=? AND entity_type='EVENT'`).bind(sourceId).first();
  const provenanceCount = await db.prepare(`SELECT COUNT(*) AS count FROM canonical_external_provenance
    WHERE entity_type='EVENT' AND canonical_entity_id=?`).bind(canonical.id).first();
  assert.equal(Number(canonicalCount?.count ?? 0), 1);
  assert.equal(Number(receiptCount?.count ?? 0), 1);
  assert.equal(Number(provenanceCount?.count ?? 0), 1);
});
