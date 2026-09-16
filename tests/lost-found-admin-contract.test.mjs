import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  allowedLostFoundTransitions,
  assertLostFoundCreateStatus,
  assertLostFoundDuplicateTarget,
  assertLostFoundStatusTransition,
  canTransitionLostFoundStatus,
} from "../lib/lost-found-lifecycle.js";

function section(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing section start: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing section end: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("new admin LOST/FOUND reports have a DRAFT-only create contract", async () => {
  assert.doesNotThrow(() => assertLostFoundCreateStatus(undefined));
  assert.doesNotThrow(() => assertLostFoundCreateStatus("DRAFT"));
  for (const status of ["PENDING", "ACTIVE", "RESOLVED", "EXPIRED", "REJECTED", "ARCHIVED"]) {
    assert.throws(() => assertLostFoundCreateStatus(status), /iba ako DRAFT/);
  }

  const store = await readFile(new URL("../lib/lost-found-dog-store.ts", import.meta.url), "utf8");
  const create = section(store, "export async function createAdminDogReport", "export async function updateAdminDogReport");
  assert.match(create, /input\.status !== undefined && input\.status !== "DRAFT"/);
  assert.match(create, /clean\.type, "DRAFT"/);
  assert.doesNotMatch(create, /publishCase/);
  assert.match(create, /assertNoDuplicateMutation\(input\)/);
});

test("moderation transition map accepts intended transitions and rejects invalid jumps", () => {
  assert.deepEqual(allowedLostFoundTransitions("DRAFT"), ["PENDING", "ACTIVE", "REJECTED", "ARCHIVED"]);
  assert.equal(canTransitionLostFoundStatus("DRAFT", "ACTIVE"), true);
  assert.equal(canTransitionLostFoundStatus("ACTIVE", "RESOLVED"), true);
  assert.equal(canTransitionLostFoundStatus("EXPIRED", "ACTIVE"), true);
  assert.equal(canTransitionLostFoundStatus("ACTIVE", "ACTIVE"), true, "same-state content edits remain allowed");
  assert.equal(canTransitionLostFoundStatus("ACTIVE", "DRAFT"), false);
  assert.equal(canTransitionLostFoundStatus("RESOLVED", "PENDING"), false);
  assert.doesNotThrow(() => assertLostFoundStatusTransition("PENDING", "ACTIVE"));
  assert.throws(() => assertLostFoundStatusTransition("ACTIVE", "DRAFT"), /Nepovolený prechod stavu ACTIVE -> DRAFT/);
});

test("server-side update path is the moderation transition source of truth", async () => {
  const store = await readFile(new URL("../lib/lost-found-dog-store.ts", import.meta.url), "utf8");
  const update = section(store, "export async function updateAdminDogReport", "export async function markAdminDogReportDuplicate");
  assert.match(update, /assertLostFoundStatusTransition\(existing\.status, requestedStatus\)/);
  assert.match(update, /Neplatný cieľový stav hlásenia/);
  assert.match(update, /assertNoDuplicateMutation\(input\)/);

  const editor = await readFile(new URL("../components/admin-lost-found-editor.tsx", import.meta.url), "utf8");
  assert.match(editor, /allowedLostFoundTransitions\(state\.status\)/);
  assert.match(editor, /Nové hlásenie sa vždy vytvorí ako koncept \(DRAFT\)/);
  assert.doesNotMatch(editor, /<select value=\{state\.status\}/);
});

test("duplicate moderation validates target existence and LOST/FOUND type", () => {
  assert.doesNotThrow(() => assertLostFoundDuplicateTarget(12, "LOST", 13, { id: 13, type: "LOST" }));
  assert.throws(() => assertLostFoundDuplicateTarget(12, "LOST", 13, null), /neexistuje/);
  assert.throws(() => assertLostFoundDuplicateTarget(12, "LOST", 13, { id: 13, type: "FOUND" }), /rovnaký typ LOST\/FOUND/);
  assert.throws(() => assertLostFoundDuplicateTarget(12, "LOST", 12, { id: 12, type: "LOST" }), /samého seba/);
});

test("duplicate is an explicit admin operation instead of a generic save side effect", async () => {
  const store = await readFile(new URL("../lib/lost-found-dog-store.ts", import.meta.url), "utf8");
  const duplicate = section(store, "export async function markAdminDogReportDuplicate", "function lifecycleFields");
  assert.match(duplicate, /Kanonické hlásenie pre duplicitu neexistuje/);
  assert.match(duplicate, /Duplicitné hlásenia musia mať rovnaký typ LOST\/FOUND/);
  assert.match(duplicate, /assertLostFoundStatusTransition\(existing\.status, "ARCHIVED"\)/);
  assert.match(duplicate, /status='ARCHIVED'/);

  const route = await readFile(new URL("../app/api/admin/lost-found/[id]/duplicate/route.ts", import.meta.url), "utf8");
  assert.match(route, /export async function POST/);
  assert.match(route, /markAdminDogReportDuplicate/);

  const editor = await readFile(new URL("../components/admin-lost-found-editor.tsx", import.meta.url), "utf8");
  assert.match(editor, /Označiť ako duplicitu/);
  assert.match(editor, /\/duplicate/);
});

test("admin list, detail and counts are read-pure and never invoke lifecycle persistence", async () => {
  const store = await readFile(new URL("../lib/lost-found-dog-store.ts", import.meta.url), "utf8");
  const list = section(store, "export async function listAdminDogReports", "export async function getAdminDogReport");
  const detail = section(store, "export async function getAdminDogReport", "export async function getAdminDogReportCounts");
  const counts = section(store, "export async function getAdminDogReportCounts", "async function preparePrivatePii");
  for (const readPath of [list, detail, counts]) {
    assert.doesNotMatch(readPath, /persistLostFoundLifecycle/);
    assert.doesNotMatch(readPath, /UPDATE\s+lost_found_dog_reports/i);
  }

  const maintenance = section(store, "export async function persistLostFoundLifecycle", "function clampPage");
  assert.match(maintenance, /status = 'EXPIRED'/);
  assert.match(maintenance, /status = 'ARCHIVED'/);
  assert.match(store, /Explicit write-side maintenance only/);
});
