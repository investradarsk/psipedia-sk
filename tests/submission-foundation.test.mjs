import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const importTs = async (path) => import(pathToFileURL(new URL(path, root).pathname).href);

function key32(seed = 7) {
  const bytes = Uint8Array.from({ length: 32 }, (_, index) => (seed + index) % 256);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

test("PII encryption roundtrip and keyed hashing avoid plaintext", async () => {
  const { encryptPii, decryptPii, hashPii, normalizeEmail } = await importTs("lib/pii-crypto.ts");
  const encryptionKey = key32(11);
  const hashKey = key32(77);
  const plaintext = "person@example.com";
  const ciphertext = await encryptPii(plaintext, encryptionKey);
  assert.equal(await decryptPii(ciphertext, encryptionKey), plaintext);
  assert.ok(!ciphertext.includes(plaintext));
  const digest = await hashPii(normalizeEmail(plaintext), hashKey);
  assert.ok(!digest.includes(plaintext));
});

test("opaque token hashing, expiry and session cookie security properties", async () => {
  const { createOpaqueToken, hashOpaqueToken, isStoredTokenUsable, buildManagementSessionCookie } = await importTs("lib/resource-access.ts");
  const token = createOpaqueToken();
  const hash = await hashOpaqueToken(token);
  assert.notEqual(hash, token);
  assert.equal(isStoredTokenUsable({ expiresAt: "2026-09-12T20:00:00.000Z" }, new Date("2026-09-12T19:00:00.000Z")), true);
  assert.equal(isStoredTokenUsable({ expiresAt: "2026-09-12T18:00:00.000Z" }, new Date("2026-09-12T19:00:00.000Z")), false);
  const cookie = buildManagementSessionCookie("psipedia_manage", token, 900);
  for (const attribute of ["HttpOnly", "Secure", "SameSite=Strict", "Path=/", "Max-Age=900"]) assert.match(cookie, new RegExp(attribute));
});

test("Turnstile fails closed, validates hostname/action and rejects replay", async () => {
  const { verifyTurnstile } = await importTs("lib/turnstile.ts");
  const now = new Date("2026-09-12T19:00:00.000Z");
  const successFetch = async () => new Response(JSON.stringify({ success: true, hostname: "psipedia.sk", action: "lost-found-submit", challenge_ts: now.toISOString() }), { status: 200, headers: { "content-type": "application/json" } });
  const claimed = new Set();
  const replayStore = { async claim(hash) { if (claimed.has(hash)) return false; claimed.add(hash); return true; } };
  assert.equal((await verifyTurnstile({ token: "token", secret: "secret", expectedHostname: "psipedia.sk", expectedAction: "lost-found-submit", now, fetchImpl: async () => new Response("{}", { status: 500 }) })).ok, false);
  assert.equal((await verifyTurnstile({ token: "token-a", secret: "secret", expectedHostname: "wrong.sk", expectedAction: "lost-found-submit", now, fetchImpl: successFetch })).reason, "hostname_mismatch");
  assert.equal((await verifyTurnstile({ token: "token-b", secret: "secret", expectedHostname: "psipedia.sk", expectedAction: "lost-found-submit", now, fetchImpl: successFetch, replayStore })).ok, true);
  assert.equal((await verifyTurnstile({ token: "token-b", secret: "secret", expectedHostname: "psipedia.sk", expectedAction: "lost-found-submit", now, fetchImpl: successFetch, replayStore })).reason, "replay_detected");
});

test("rate limit denies requests beyond configured count", async () => {
  const source = await fs.readFile(new URL("../lib/rate-limit.ts", import.meta.url), "utf8");
  assert.match(source, /count <= limit/);
  assert.match(source, /ON CONFLICT\(bucket_key\)/);
  assert.doesNotMatch(source, /rawIdentifier.*INSERT/i);
});

test("plaintext UGC rejects executable HTML and audit payload redacts PII", async () => {
  const { normalizePlainText, sanitizeAuditPayload } = await importTs("lib/submission-security.ts");
  assert.throws(() => normalizePlainText("<script>alert(1)</script>", { max: 100, field: "description" }));
  const audit = JSON.stringify(sanitizeAuditPayload({ email: "person@example.com", phone: "+421900123456", note: "contact person@example.com" }));
  assert.ok(!audit.includes("person@example.com"));
  assert.ok(!audit.includes("+421900123456"));
});

test("image pipeline rejects MIME mismatch and only publishes SAFE namespace", async () => {
  const { detectImageMime, ingestPrivateImage, publishSafeImage } = await importTs("lib/private-media.ts");
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00]);
  assert.equal(detectImageMime(jpeg), "image/jpeg");
  const objects = new Map();
  const bucket = { async put(key, value) { const bytes = value instanceof Uint8Array ? value : new Uint8Array(await new Response(value).arrayBuffer()); objects.set(key, bytes); }, async get(key) { const bytes = objects.get(key); return bytes ? { body: new Blob([bytes]).stream(), async arrayBuffer() { return bytes.buffer; } } : null; }, async delete(key) { objects.delete(key); } };
  const safeOutput = Uint8Array.from([0x52,0x49,0x46,0x46,0x04,0x00,0x00,0x00,0x57,0x45,0x42,0x50]);
  const images = { input() { return { transform() { return this; }, output() { return { async response() { return new Response(safeOutput, { status: 200 }); } }; } }; } };
  await assert.rejects(() => ingestPrivateImage({ bytes: jpeg, declaredMime: "image/png", ownerType: "TEST", ownerId: "1", privateBucket: bucket, images }));
  const result = await ingestPrivateImage({ bytes: jpeg, declaredMime: "image/jpeg", ownerType: "TEST", ownerId: "1", privateBucket: bucket, images });
  const safeBytes = objects.get(result.safeKey);
  assert.ok(safeBytes);
  assert.ok(!new TextDecoder().decode(safeBytes).includes("Exif"));
  await assert.rejects(() => publishSafeImage({ safeKey: result.rawKey, publicKey: "x.webp", privateBucket: bucket, publicBucket: bucket }));
});

test("quarantine is structurally separate from public /media bucket and feature flags default off", async () => {
  const mediaRoute = await fs.readFile(new URL("../app/media/[...key]/route.ts", import.meta.url), "utf8");
  const privateMedia = await fs.readFile(new URL("../lib/private-media.ts", import.meta.url), "utf8");
  const flags = await fs.readFile(new URL("../lib/submission-feature-flags.ts", import.meta.url), "utf8");
  assert.match(mediaRoute, /\.BUCKET/);
  assert.doesNotMatch(mediaRoute, /SUBMISSION_UPLOADS/);
  assert.match(privateMedia, /quarantine\//);
  assert.match(flags, /value === "1"/);
  assert.ok(!flags.includes("default(true)"));
});

test("migration is additive and does not mutate domain tables", async () => {
  const sql = await fs.readFile(new URL("../drizzle/0029_submission_moderation_security_foundation.sql", import.meta.url), "utf8");
  for (const forbidden of ["DROP TABLE", "ALTER TABLE help_cases", "lost_found_cases", "lost_found_private_details", "adoption_dogs"]) assert.ok(!sql.includes(forbidden));
  for (const table of ["moderation_submissions", "moderation_events", "media_assets", "resource_access_tokens", "resource_management_sessions"]) assert.match(sql, new RegExp(`CREATE TABLE \\`${table}\\``));
});

test("existing help and admin authentication files are not replaced by foundation", async () => {
  const auth = await fs.readFile(new URL("../lib/admin-auth.ts", import.meta.url), "utf8");
  const help = await fs.readFile(new URL("../lib/help-store.ts", import.meta.url), "utf8");
  assert.match(auth, /getCloudflareAccessUser/);
  assert.match(help, /helpCases/);
});
