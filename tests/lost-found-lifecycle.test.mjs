import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  LOST_FOUND_PRIVATE_PII_RETENTION_DAYS,
  LOST_FOUND_PUBLIC_ACTIVE_DAYS,
  LOST_FOUND_PUBLIC_ARCHIVE_AFTER_EXPIRED_DAYS,
  defaultLostFoundExpiresAt,
  effectiveLostFoundStatus,
  expiredArchiveThreshold,
  lostFoundStatusIsPublic,
  lostFoundStatusShouldIndex,
} from "../lib/lost-found-lifecycle.js";

test("ACTIVE report receives a deterministic public expiry window", () => {
  const now = new Date("2026-09-12T10:00:00.000Z");
  assert.equal(LOST_FOUND_PUBLIC_ACTIVE_DAYS, 30);
  assert.equal(defaultLostFoundExpiresAt(now), "2026-10-12T10:00:00.000Z");
});

test("ACTIVE becomes effectively EXPIRED after expiresAt without destructive deletion", () => {
  const now = new Date("2026-09-12T10:00:00.000Z");
  assert.equal(effectiveLostFoundStatus({ status: "ACTIVE", expiresAt: "2026-09-12T09:59:59.000Z" }, now), "EXPIRED");
  assert.equal(effectiveLostFoundStatus({ status: "ACTIVE", expiresAt: "2026-09-13T10:00:00.000Z" }, now), "ACTIVE");
});

test("public EXPIRED case becomes ARCHIVED only after the configured case window", () => {
  const now = new Date("2026-12-11T10:00:00.000Z");
  assert.equal(LOST_FOUND_PUBLIC_ARCHIVE_AFTER_EXPIRED_DAYS, 90);
  assert.equal(expiredArchiveThreshold(now), "2026-09-12T10:00:00.000Z");
  assert.equal(effectiveLostFoundStatus({ status: "EXPIRED", expiresAt: "2026-09-12T09:59:59.000Z" }, now), "ARCHIVED");
  assert.equal(effectiveLostFoundStatus({ status: "EXPIRED", expiresAt: "2026-09-13T10:00:00.000Z" }, now), "EXPIRED");
});

test("private PII retention remains separate and intentionally unset before launch policy", () => {
  assert.equal(LOST_FOUND_PRIVATE_PII_RETENTION_DAYS, null);
});

test("only ACTIVE reports are indexable while historical public URLs stay readable", () => {
  for (const status of ["ACTIVE", "RESOLVED", "EXPIRED", "ARCHIVED"]) assert.equal(lostFoundStatusIsPublic(status), true);
  for (const status of ["DRAFT", "PENDING", "REJECTED"]) assert.equal(lostFoundStatusIsPublic(status), false);
  assert.equal(lostFoundStatusShouldIndex("ACTIVE"), true);
  for (const status of ["RESOLVED", "EXPIRED", "ARCHIVED", "DRAFT", "PENDING", "REJECTED"]) assert.equal(lostFoundStatusShouldIndex(status), false);
});

test("public LOST/FOUND table cannot contain contact PII or private moderation data", async () => {
  const migration = await readFile(new URL("../drizzle/0030_lost_found_dogs.sql", import.meta.url), "utf8");
  const privateMarker = "CREATE TABLE `lost_found_dog_private_details`";
  const markerIndex = migration.indexOf(privateMarker);
  assert.notEqual(markerIndex, -1);
  const publicSql = migration.slice(0, markerIndex);
  const privateSql = migration.slice(markerIndex);

  for (const forbidden of [
    "`contact_name_encrypted`",
    "`contact_phone_encrypted`",
    "`contact_phone_hash`",
    "`contact_email_encrypted`",
    "`contact_email_hash`",
    "`private_note_encrypted`",
    "`verification_note_encrypted`",
    "`private_location_description_encrypted`",
    "`private_latitude_encrypted`",
    "`private_longitude_encrypted`",
    "`created_by`",
    "`updated_by`",
  ]) {
    assert.equal(publicSql.includes(forbidden), false, `${forbidden} must not exist in lost_found_dog_reports`);
  }

  for (const required of [
    "`contact_name_encrypted`",
    "`contact_phone_encrypted`",
    "`contact_phone_hash`",
    "`contact_email_encrypted`",
    "`contact_email_hash`",
    "`private_note_encrypted`",
    "`verification_note_encrypted`",
    "`private_location_description_encrypted`",
    "`private_latitude_encrypted`",
    "`private_longitude_encrypted`",
    "`created_by`",
    "`updated_by`",
  ]) {
    assert.equal(privateSql.includes(required), true, `${required} must exist in lost_found_dog_private_details`);
  }
});

test("LOST/FOUND private persistence uses the canonical foundation PII helpers", async () => {
  const store = await readFile(new URL("../lib/lost-found-dog-store.ts", import.meta.url), "utf8");
  assert.match(store, /encryptPii\(/);
  assert.match(store, /decryptPii\(/);
  assert.match(store, /hashPii\(/);
  assert.match(store, /normalizeEmail\(/);
  assert.match(store, /normalizePhone\(/);

  const publicQueryStart = store.indexOf("export async function listPublicDogReports");
  const adminQueryStart = store.indexOf("export async function listAdminDogReports");
  assert.ok(publicQueryStart >= 0 && adminQueryStart > publicQueryStart);
  const publicQuerySection = store.slice(publicQueryStart, adminQueryStart);
  assert.equal(publicQuerySection.includes("lost_found_dog_private_details"), false, "public list/detail/sitemap path must not join private LOST/FOUND PII");
});
