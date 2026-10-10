import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  NOTION_REVIEW_BATCH_SIZE,
  appendNotionReview,
  canClearResolvedNotionConflict,
  classifyDirectorySyncError,
  emptyNotionReviewQueue,
} from "../lib/notion-data-quality-recovery.ts";
import { summarizeNotionAuditBatch } from "../lib/notion-data-quality-audit.ts";

test("review queue retains first 100, reports all conflicts, no content values", () => {
  const queue = emptyNotionReviewQueue();
  for (let i = 0; i < 105; i++) {
    appendNotionReview(queue, {
      entityId: i + 1,
      notionPageId: "notion-" + (i + 1),
      reason: "BIDIRECTIONAL_CONFLICT",
      fields: ["Adresa", "Názov", "Adresa"],
      baselineAvailable: true,
      notionChanged: true,
      psipediaChanged: true,
    });
  }
  assert.equal(NOTION_REVIEW_BATCH_SIZE, 100);
  assert.equal(queue.total, 105);
  assert.equal(queue.items.length, 100);
  assert.equal(queue.remaining, 5);
  assert.deepEqual(queue.items[0].fields, ["Adresa", "Názov"]);
  assert.equal(queue.items[0].action, "REVIEW_REQUIRED");
  assert.ok(!JSON.stringify(queue).includes("secret private street"));
});

test("only identical current snapshots can clear a historical CONFLICT flag", () => {
  const base = {
    canonicalHash: "same-current",
    notionHash: "same-current",
    syncStatus: "Chyba",
    syncError: "CONFLICT: Od posledného úspešného syncu sa zmenil Notion aj canonical Psipedia.",
  };
  assert.equal(canClearResolvedNotionConflict(base), true);
  assert.equal(canClearResolvedNotionConflict({ ...base, notionHash: "not-equal" }), false);
  assert.equal(canClearResolvedNotionConflict({ ...base, syncError: "Doplň číslo domu." }), false);
  assert.equal(canClearResolvedNotionConflict({ ...base, syncError: "CONFLICT: x", syncStatus: "Synchronizované" }), false);
  assert.equal(canClearResolvedNotionConflict({ ...base, canonicalHash: "" }), false);
});

test("directory errors remain separated by remediation and never invent an address", () => {
  const known = [
    ["Doplň číslo domu.", "MISSING_HOUSE_NUMBER"],
    ["Najprv vyber platný kraj, okres a obec / mesto.", "INVALID_LOCALITY"],
    ["Illegal invocation: function called with incorrect `this` reference.", "ILLEGAL_INVOCATION"],
    ["Telefónne číslo nie je platné.", "INVALID_PHONE"],
    ["E-mailová adresa nie je platná.", "INVALID_EMAIL"],
    ["Webová adresa nie je platná.", "INVALID_WEBSITE"],
    ["Hlavný obrázok sa nepodarilo stiahnuť (HTTP 403).", "REMOTE_IMAGE_BLOCKED"],
    ["Unknown exception", "OTHER"],
  ];
  for (const [message, expected] of known) {
    assert.equal(classifyDirectorySyncError(message), expected);
  }
});

test("event synchronization protects ambiguous two-sided changes and uses read-only review", async () => {
  const source = await readFile(new URL("../lib/notion-events-help-sync.ts", import.meta.url), "utf8");
  assert.match(source, /decision\.decision === "CONFLICT"/);
  assert.match(source, /reason: "BIDIRECTIONAL_CONFLICT"/);
  assert.match(source, /differingAgendaSnapshotFields\(/);
  assert.match(source, /appendNotionReview\(/);
  assert.match(source, /canClearResolvedNotionConflict\(/);
  assert.match(source, /if \(input\.mode !== "dry-run"\)/);
  assert.match(source, /applyNotionToCanonical/);
});

test("100-record Notion dry-run audit reports types, coordinates, and no sensitive values", () => {
  const rich = (text) => ({ type: "rich_text", rich_text: [{ plain_text: text }] });
  const sample = [
    {
      id: "n1",
      properties: {
        "Psipedia ID": rich("77"),
        "Sync chyba": rich("Illegal invocation: function called with incorrect this reference."),
        "Sync stav": { select: { name: "Chyba" } },
        "Adresa": rich("Súkromná 123, Mesto"),
        "Latitude": { number: 48.2 },
        "Longitude": { number: 18.3 },
        "Google miesto aktuálne": { checkbox: false },
        "Google Maps netreba": { checkbox: true },
      },
    },
    {
      id: "n2",
      properties: {
        "Psipedia ID": rich("78"),
        "Sync chyba": rich(""),
        "Adresa": rich(""),
        "Latitude": { number: null },
        "Longitude": { number: null },
      },
    },
  ];
  const audit = summarizeNotionAuditBatch("directory", sample);
  assert.equal(audit.examined, 2);
  assert.equal(audit.linked, 2);
  assert.equal(audit.syncErrors, 1);
  assert.equal(audit.addressPresent, 1);
  assert.equal(audit.publicCoordinates, 1);
  assert.equal(audit.googleNotRequired, 1);
  assert.equal(audit.errorTypes.ILLEGAL_INVOCATION, 1);
  assert.equal(audit.reviewItems[0].nextStep, "INVESTIGATE_RUNTIME");
  assert.ok(!JSON.stringify(audit).includes("Súkromná"));
  assert.ok(!JSON.stringify(audit).includes("Illegal invocation"));
});

test("admin endpoint is access-controlled, dry-run-only and paginated at 100", async () => {
  const source = await readFile(new URL("../app/api/admin/notion-data-quality-audit/route.ts", import.meta.url), "utf8");
  assert.match(source, /requireAdminMutation\(request\)/);
  assert.match(source, /body\.mode !== "dry-run"/);
  assert.match(source, /page_size: 100/);
  assert.match(source, /allowCreate: false/);
  assert.match(source, /persist: false/);
  assert.doesNotMatch(source, /method: "PATCH"/);
  assert.doesNotMatch(source, /method: "PUT"/);
  assert.doesNotMatch(source, /\.run\(\)/);
});
