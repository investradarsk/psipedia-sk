import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MAX_IMAGE_REVIEW_BATCH, summarizeMediaReviewOutcome } from "../lib/admin-data-quality-image-review.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const ui = read("components/admin-data-quality-dashboard.tsx");
const css = read("components/admin-data-quality-image-review-v2.module.css");
const bulk = read("app/api/admin/data-quality/media/bulk/route.ts");
const single = read("app/api/admin/data-quality/media/[id]/accept/route.ts");
const svc = read("lib/media-source-monitor.ts");
const decisionStore = read("lib/media-source-review-decisions.ts");
const historyRoute = read("app/api/admin/data-quality/media/[id]/history/route.ts");
const migration = read("drizzle/0137_media_source_review_decisions.sql");

test("single and bulk decisions are confirmed with one request at a time", () => {
  for (const phrase of [
    'openMediaDecision("accept", [monitor.id])',
    'openMediaDecision("reject", [monitor.id])',
    'openMediaDecision("accept", [...visibleSelectedMedia])',
    'openMediaDecision("reject", [...visibleSelectedMedia])',
    'confirmMediaDecision()',
    'decisionInFlight.current = true',
    'decisionInFlight.current = false',
    'if (!decision || busy !== null || decisionInFlight.current) return',
    'setDecision(null)',
    'Systém sa následne pokúsi nájsť iných kandidátov',
  ]) assert.ok(ui.includes(phrase), phrase);
  assert.equal(ui.split("<AdminModalDialog").length - 1, 2);
  assert.ok(!ui.includes('onClick={() => void bulkMediaAction("reject"'));
});

test("selection, comparison and navigation remain independent", () => {
  for (const phrase of [
    "new Set(reviewableMediaIds)",
    "visibleSelectedMedia", "AdminBulkActionToolbar",
    "onClear={() => setSelectedMedia(new Set())}",
    "detailItem", "setDetailId(monitor.id)",
    "Aktuálny obrázok", "Navrhovaný obrázok",
    'pageHref("mediaPage"', "mediaStatusOptions",
    'sectionHref("profiles")'
  ]) assert.ok(ui.includes(phrase), phrase);
});

test("bulk result is honest for all successful, partial and all failed outcomes", () => {
  assert.equal(MAX_IMAGE_REVIEW_BATCH, 50);
  assert.equal(summarizeMediaReviewOutcome("accept", [1,2], {requested:2,updated:2,failed:[]}).tone,"success");
  const partial=summarizeMediaReviewOutcome("reject",[1,2],{requested:2,updated:1,failed:[{id:2,error:"Konflikt"}]});
  assert.equal(partial.tone,"partial");
  assert.deepEqual(partial.failed,[{id:2,error:"Konflikt"}]);
  assert.ok(partial.message.includes("Čiastočný úspech"));
  assert.equal(summarizeMediaReviewOutcome("reject",[5],{requested:1,updated:0,failed:[{id:5,error:"Chýba"}]}).tone,"error");
  assert.ok(ui.includes("new Set(summary.failed.map"));
  assert.ok(ui.includes('role="alert"'));
});

test("optional candidate snapshots check stale rows on the server; old callers remain accepted", () => {
  assert.ok(bulk.includes(".slice(0, 50)"));
  assert.ok(bulk.includes("expectedCandidates !== undefined"));
  assert.equal(bulk.split("expectedCandidateImageKey: expected").length - 1,2);
  assert.ok(single.includes('const text = await request.text()'));
  assert.ok(single.includes('text ? JSON.parse(text)'));
  assert.equal(svc.split("Konflikt: kandidát obrázka sa zmenil").length - 1,2);
  assert.ok(svc.includes("rejectedCandidateMarker(rejected)"));
  assert.ok(svc.includes("outcome = await monitorOne"));
  assert.ok(ui.includes("expectedCandidates"));
});

test("mobile layouts and semantic 44px actions are local to image review", () => {
  assert.ok(css.includes("max-width:640px"));
  assert.ok(css.includes("max-width:360px"));
  assert.ok(css.includes("min-height: 44px") || css.includes("min-height:44px"));
  assert.ok(css.includes("grid-template-columns:minmax(0,1fr)"));
  assert.ok(ui.includes("Schváliť obrázok – ${label}"));
  assert.ok(ui.includes("Zamietnuť obrázok – ${label}"));
  assert.ok(ui.includes("Detailne porovnať obrázky – ${label}"));
});

test("reason, authenticated history, migration and candidate CAS are wired without reworking profiles", () => {
  assert.ok(ui.includes('name="reason"'));
  assert.ok(ui.includes('maxLength={500}'));
  assert.ok(ui.includes("Dôvod zamietnutia (voliteľný)"));
  assert.ok(ui.includes("loadMediaHistory(detailItem.monitor.id)"));
  assert.ok(ui.includes("Chýbajúce údaje v profiloch"));
  assert.ok(bulk.includes("validateMediaReviewReason(body.reason)"));
  assert.ok(bulk.includes("reason,"));
  assert.ok(historyRoute.includes("getAdminApiUser()"));
  assert.ok(historyRoute.includes("private, no-store"));
  assert.ok(decisionStore.includes("review_claim_token IS NULL"));
  assert.ok(decisionStore.includes("image_key IS ?"));
  assert.ok(decisionStore.includes("database.batch(["));
  assert.ok(decisionStore.includes("listMediaReviewHistory"));
  assert.ok(migration.includes("review_claim_token"));
  assert.ok(migration.includes("media_source_review_decisions"));
  assert.ok(migration.includes("length(reason) <= 500"));
});
