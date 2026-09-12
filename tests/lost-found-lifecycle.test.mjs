import assert from "node:assert/strict";
import test from "node:test";
import {
  ARCHIVE_AFTER_EXPIRED_DAYS,
  DEFAULT_ACTIVE_DAYS,
  defaultLostFoundExpiresAt,
  effectiveLostFoundStatus,
  expiredArchiveThreshold,
  lostFoundStatusIsPublic,
  lostFoundStatusShouldIndex,
} from "../lib/lost-found-lifecycle.js";

test("ACTIVE report receives a deterministic default expiry window", () => {
  const now = new Date("2026-09-12T10:00:00.000Z");
  assert.equal(DEFAULT_ACTIVE_DAYS, 30);
  assert.equal(defaultLostFoundExpiresAt(now), "2026-10-12T10:00:00.000Z");
});

test("ACTIVE becomes effectively EXPIRED after expiresAt without destructive deletion", () => {
  const now = new Date("2026-09-12T10:00:00.000Z");
  assert.equal(effectiveLostFoundStatus({ status: "ACTIVE", expiresAt: "2026-09-12T09:59:59.000Z" }, now), "EXPIRED");
  assert.equal(effectiveLostFoundStatus({ status: "ACTIVE", expiresAt: "2026-09-13T10:00:00.000Z" }, now), "ACTIVE");
});

test("EXPIRED becomes ARCHIVED only after archive retention window", () => {
  const now = new Date("2026-12-11T10:00:00.000Z");
  assert.equal(ARCHIVE_AFTER_EXPIRED_DAYS, 90);
  assert.equal(expiredArchiveThreshold(now), "2026-09-12T10:00:00.000Z");
  assert.equal(effectiveLostFoundStatus({ status: "EXPIRED", expiresAt: "2026-09-12T09:59:59.000Z" }, now), "ARCHIVED");
  assert.equal(effectiveLostFoundStatus({ status: "EXPIRED", expiresAt: "2026-09-13T10:00:00.000Z" }, now), "EXPIRED");
});

test("only ACTIVE reports are indexable while historical public URLs stay readable", () => {
  for (const status of ["ACTIVE", "RESOLVED", "EXPIRED", "ARCHIVED"]) assert.equal(lostFoundStatusIsPublic(status), true);
  for (const status of ["DRAFT", "PENDING", "REJECTED"]) assert.equal(lostFoundStatusIsPublic(status), false);
  assert.equal(lostFoundStatusShouldIndex("ACTIVE"), true);
  for (const status of ["RESOLVED", "EXPIRED", "ARCHIVED", "DRAFT", "PENDING", "REJECTED"]) assert.equal(lostFoundStatusShouldIndex(status), false);
});
