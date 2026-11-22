import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const importTs = async (path) => import(pathToFileURL(new URL(path, root).pathname).href);
const outreachSource = await fs.readFile(new URL("../lib/outreach-store.ts", import.meta.url), "utf8");
const providerSource = await fs.readFile(new URL("../lib/outreach-email.ts", import.meta.url), "utf8");
const securitySource = await fs.readFile(new URL("../lib/outreach-security.ts", import.meta.url), "utf8");
const migrationSource = await fs.readFile(new URL("../drizzle/0053_outreach_foundation.sql", import.meta.url), "utf8");
const createRoute = await fs.readFile(new URL("../app/api/admin/outreach/campaigns/route.ts", import.meta.url), "utf8");
const sendRoute = await fs.readFile(new URL("../app/api/admin/outreach/campaigns/[id]/send/route.ts", import.meta.url), "utf8");
const verificationRoute = await fs.readFile(new URL("../app/api/outreach/verification/route.ts", import.meta.url), "utf8");

test("recipient extraction reads canonical Directory email aliases only", async () => {
  const { directoryOutreachEmailValues } = await importTs("lib/outreach.ts");
  assert.deepEqual(directoryOutreachEmailValues(JSON.stringify({ "E-mail": "Info@Example.sk; team@example.sk" })), ["Info@Example.sk", "team@example.sk"]);
  assert.deepEqual(directoryOutreachEmailValues(JSON.stringify({ note: "hidden@example.sk" })), []);
});

test("invalid email handling rejects malformed contacts", async () => {
  const { isValidOutreachEmail } = await importTs("lib/outreach.ts");
  assert.equal(isValidOutreachEmail("person@example.sk"), true);
  assert.equal(isValidOutreachEmail("not-an-email"), false);
  assert.equal(isValidOutreachEmail("a @example.sk"), false);
});

test("normalized email dedupe aggregates multiple entities into one recipient", async () => {
  const { buildOutreachDryRun } = await importTs("lib/outreach.ts");
  const base = {
    region: "Nitriansky kraj",
    verified: false,
    publicSnapshot: {},
    profileUrl: "https://psipedia.sk/test",
  };
  const result = buildOutreachDryRun([
    { ...base, entityType: "HELP_ORGANIZATION", entityId: "1", entityName: "A", rawEmail: "INFO@example.sk" },
    { ...base, entityType: "DIRECTORY_PROFILE", entityId: "2", entityName: "B", rawEmail: " info@example.sk " },
  ], new Set());
  assert.equal(result.uniqueRecipientCount, 1);
  assert.equal(result.recipients[0].entities.length, 2);
  assert.equal(result.deduplicatedCount, 1);
});

test("global suppression excludes a recipient from dry run output", async () => {
  const { buildOutreachDryRun } = await importTs("lib/outreach.ts");
  const result = buildOutreachDryRun([{
    entityType: "HELP_ORGANIZATION",
    entityId: "1",
    entityName: "A",
    profileUrl: "https://psipedia.sk/organizacie/a",
    region: "",
    rawEmail: "info@example.sk",
    verified: false,
    publicSnapshot: {},
  }], new Set(["info@example.sk"]));
  assert.equal(result.uniqueRecipientCount, 0);
  assert.equal(result.suppressedCount, 1);
});

test("dry run is structurally send-free and must precede READY preparation", () => {
  const start = outreachSource.indexOf("export async function previewOutreachCampaign");
  const end = outreachSource.indexOf("async function runBatches", start);
  const previewBody = outreachSource.slice(start, end);
  assert.doesNotMatch(previewBody, /provider\.send|fetch\(/);
  assert.match(outreachSource, /if \(!campaign\.previewedAt\) throw new Error\("Pred prípravou kampane je povinný Dry run \/ Preview\."\)/);
});

test("campaign creation and sending are admin-authorized mutations", () => {
  assert.match(createRoute, /getAdminApiUser/);
  assert.match(createRoute, /if \(!user\) return unauthorizedAdminResponse\(\)/);
  assert.match(createRoute, /assertOutreachJsonMutation/);
  assert.match(sendRoute, /getAdminApiUser/);
  assert.match(sendRoute, /assertOutreachJsonMutation/);
});

test("send state guard, bounded batch, retry cap and duplicate-send claim are explicit", () => {
  assert.match(outreachSource, /campaign\.status !== "READY" && campaign\.status !== "SENDING"/);
  assert.match(outreachSource, /Math\.min\(25,/);
  assert.match(outreachSource, /send_state='FAILED' AND attempts<3/);
  assert.match(outreachSource, /SET send_state='SENDING',attempts=attempts\+1/);
  assert.match(outreachSource, /WHERE id=\? AND \(\(send_state='QUEUED'\) OR \(send_state='FAILED' AND attempts<3\)\) RETURNING/);
  assert.match(migrationSource, /outreach_recipients_campaign_email_unique/);
  assert.match(outreachSource, /idempotencyKey: "outreach\/" \+ id \+ "\/" \+ row\.id/);
});

test("provider failure is fail-closed and production send is opt-in", async () => {
  const envExample = await fs.readFile(new URL("../.env.example", import.meta.url), "utf8");
  assert.match(providerSource, /OUTREACH_SEND_ENABLED !== "1"/);
  assert.match(providerSource, /return null/);
  assert.match(outreachSource, /Odosielanie zostalo fail-closed|Odosielanie zostalo fail-closed|fail-closed/);
  assert.match(envExample, /OUTREACH_SEND_ENABLED=0/);
  for (const placeholder of ["{profiles}", "{verification_url}", "{unsubscribe_url}"]) {
    assert.ok(outreachSource.includes(placeholder), "missing required outreach template placeholder " + placeholder);
  }
});

test("claim tokens use opaque hashing; tampered and expired tokens are rejected", async () => {
  const { createOpaqueToken, hashOpaqueToken, isStoredTokenUsable } = await importTs("lib/resource-access.ts");
  const token = createOpaqueToken();
  assert.ok(token.length >= 43);
  const hash = await hashOpaqueToken(token);
  assert.notEqual(hash, token);
  assert.notEqual(await hashOpaqueToken(token + "x"), hash);
  assert.equal(isStoredTokenUsable({ expiresAt: "2099-01-01T00:00:00.000Z" }, new Date("2026-09-20T00:00:00.000Z")), true);
  assert.equal(isStoredTokenUsable({ expiresAt: "2020-01-01T00:00:00.000Z" }, new Date("2026-09-20T00:00:00.000Z")), false);
  assert.match(securitySource, /createOpaqueToken\(32\)/);
  assert.match(migrationSource, /token_hash text NOT NULL/);
  assert.doesNotMatch(migrationSource, /token text/);
});

test("unsubscribe mutations remain token-rate-limited without PII identifiers", () => {
  assert.match(outreachSource, /createD1RateLimitStore/);
  assert.match(outreachSource, /"outreach-token:" \+ purpose \+ ":" \+ tokenHash/);
  assert.match(outreachSource, /12,[\s\S]{0,80}60 \* 60/);
  assert.match(outreachSource, /enforceOutreachTokenRateLimit\(db, token, "UNSUBSCRIBE"\)/);
});

test("retired email verification route rejects anonymous writes and preserves Partner guidance", async () => {
  const page = await fs.readFile(new URL("../app/overenie-profilu/[token]/page.tsx", import.meta.url), "utf8");
  assert.match(verificationRoute, /export async function POST\(\)/);
  assert.match(verificationRoute, /status: 410/);
  assert.match(verificationRoute, /"Cache-Control": "no-store"/);
  assert.doesNotMatch(verificationRoute, /submitOutreachVerification|request\.json|moderation_submissions/);
  assert.doesNotMatch(outreachSource, /submitOutreachVerification|INSERT INTO moderation_submissions/);
  assert.doesNotMatch(page, /OutreachVerificationForm|Odoslať návrh/);
  assert.match(page, /getOutreachVerificationContext\(token\)/);
  assert.match(page, /outreachPartnerClaimHref\(entity\.entityType, entity\.entityId\)/);
  assert.match(page, /href="\/partner\/profily"/);
  // The old email can be opened without granting editing rights.
  assert.match(page, /Samotný e-mailový odkaz vám/);
});

test("Partner claim links reject unknown types and unsafe IDs", async () => {
  const { outreachPartnerClaimHref } = await importTs("lib/outreach.ts");
  for (const type of ["DIRECTORY_PROFILE", "HELP_ORGANIZATION", "MANAGED_EVENT", "HELP_CASE"]) {
    assert.equal(outreachPartnerClaimHref(type, "101"), "/partner/prevziat-profil/" + type + "/101");
  }
  for (const [type, id] of [["DIRECTORY_PROFILE", "../admin"], ["DIRECTORY_PROFILE", "0"], ["INVALID", "12"], ["DIRECTORY_PROFILE", "Infinity"], ["DIRECTORY_PROFILE", "1?redirect=outside"]]) {
    assert.equal(outreachPartnerClaimHref(type, id), "/partner/registracia");
  }
});

test("old saved email copy is rewritten at send time; unsubscribe link remains unchanged", async () => {
  const { renderOutreachText } = await importTs("lib/outreach.ts");
  const email = renderOutreachText({
    subjectTemplate: "Kontrola",
    bodyTemplate: [
      "Prosíme o krátku kontrolu údajov. Opravy alebo chýbajúce informácie môžete navrhnúť cez tento bezpečný odkaz:",
      "{verification_url}",
      "Návrh nič automaticky neprepíše ani nezverejní. Každú zmenu najprv skontroluje redakcia Psipedia.",
      "{unsubscribe_url}",
    ].join("\n"),
    entities: [{ entityName: "Veterina", profileUrl: "https://psipedia.sk/adresar/veterinari/veterina" }],
    verificationUrl: "https://psipedia.sk/overenie-profilu/old-token",
    unsubscribeUrl: "https://psipedia.sk/odhlasenie-osloveni/old-optout-token",
  });
  assert.match(email.text, /Partner účet/);
  assert.doesNotMatch(email.text, /Opravy alebo chýbajúce informácie môžete navrhnúť|Návrh nič automaticky neprepíše/);
  assert.match(email.text, /https:\/\/psipedia\.sk\/overenie-profilu\/old-token/);
  assert.match(email.text, /https:\/\/psipedia\.sk\/odhlasenie-osloveni\/old-optout-token/);
});

test("webhook processing is authenticated, idempotent and stores no raw payload", () => {
  assert.match(securitySource, /svix-id/);
  assert.match(securitySource, /WEBHOOK_TOLERANCE_SECONDS = 5 \* 60/);
  assert.match(migrationSource, /provider_event_id text PRIMARY KEY/);
  assert.match(outreachSource, /ON CONFLICT\(provider_event_id\) DO NOTHING RETURNING/);
  assert.doesNotMatch(migrationSource, /raw_payload|payload_json/);
});

test("hard bounce, complaint and unsubscribe create durable suppression", () => {
  assert.match(outreachSource, /'HARD_BOUNCE','provider_webhook'/);
  assert.match(outreachSource, /'COMPLAINT','provider_webhook'/);
  assert.match(outreachSource, /'UNSUBSCRIBE','recipient_link'/);
  assert.match(outreachSource, /email\.opened.*email\.clicked|email\.opened/);
  assert.match(outreachSource, /ignored_engagement_tracking/);
});

test("events and Help free-form notes are not treated as invented email sources", () => {
  assert.match(outreachSource, /MANAGED_EVENT and HELP_CASE stay explicit entity types/);
  assert.doesNotMatch(outreachSource, /contact_note.*splitOutreachEmails/);
  assert.doesNotMatch(outreachSource, /managed_events[\s\S]{0,200}email/);
});

test("campaign schema carries audit, lifecycle and delivery state without a CRM", () => {
  for (const table of [
    "outreach_campaigns",
    "outreach_recipients",
    "outreach_recipient_entities",
    "outreach_suppressions",
    "outreach_claim_tokens",
    "outreach_delivery_events",
  ]) assert.match(migrationSource, new RegExp("CREATE TABLE " + table));
  for (const status of ["DRAFT", "READY", "SENDING", "SENT", "PAUSED", "COMPLETED", "CANCELLED"]) {
    assert.match(migrationSource, new RegExp(status));
  }
});
