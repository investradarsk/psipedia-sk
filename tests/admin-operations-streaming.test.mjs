import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("operations shell streams before the 15-source read without duplicate bell queries", () => {
  const source = read("app/admin/operations/page.tsx");
  const handler = source.slice(source.indexOf("export default async function AdminOperationsPage"));
  assert.match(handler, /const attentionPromise = loadAdminAttentionPage\(\{ filters, cursor \}\)/);
  assert.doesNotMatch(handler, /await loadAdminAttentionPage/);
  assert.match(handler, /attentionSummaryPromise = attentionPromise\.then\(toNotificationSummary\)/);
  assert.match(handler, /attentionSummaryPromise=\{attentionSummaryPromise\}/);
  assert.match(handler, /<Suspense fallback=/);
  assert.match(handler, /<AdminOperationsContent attentionPromise=\{attentionPromise\}/);
  assert.match(source, /async function AdminOperationsContent/);
  assert.match(source, /const attention = await attentionPromise/);
  assert.match(source, /id="centrum-pozornosti"/);
  assert.match(source, /<AdminAttentionQueue[\s\S]*?page=\{attention\}/);
  assert.doesNotMatch(handler, /loadExactAdminAttentionSummary/);
});

test("operations bell retains exact availability and unavailable source semantics", () => {
  const source = read("app/admin/operations/page.tsx");
  const projection = source.slice(source.indexOf("function toNotificationSummary"), source.indexOf("async function AdminOperationsContent"));
  assert.match(projection, /page\.summary\.active/);
  assert.match(projection, /page\.summary\.bySource/);
  assert.match(projection, /page\.availability === "PARTIAL"/);
  assert.match(projection, /page\.availability === "UNAVAILABLE"/);
  assert.match(projection, /source\.state === "UNAVAILABLE"/);
  assert.doesNotMatch(projection, /loadAdminAttentionPage/);
});

test("activity feed avoids hidden-tab polls, overlapping GETs and stale acknowledgement resets", () => {
  const source = read("components/admin-workspace-activity.tsx");
  assert.match(source, /refreshInFlight\.current\)return refreshInFlight\.current/);
  assert.match(source, /document\.visibilityState==="visible"&&navigator\.onLine/);
  assert.match(source, /document\.addEventListener\("visibilitychange",poll\)/);
  assert.match(source, /document\.removeEventListener\("visibilitychange",poll\)/);
  assert.match(source, /acknowledgedIds\.current\.add\(id\)/);
  assert.match(source, /acknowledgedIds\.current\.has\(item\.id\)/);
  assert.match(source, /window\.setInterval\(poll,60_000\)/);
});
