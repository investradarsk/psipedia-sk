import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  normalizePublicLostFoundSubmission,
  publicLostFoundHoneypotTriggered,
  PublicLostFoundSubmissionError,
} from "../lib/lost-found-public-submission.ts";
import { assertPublicLostFoundMutation } from "../lib/lost-found-public-security.ts";

function validForm(overrides = {}) {
  const values = {
    type: "FOUND",
    dogName: "Bady",
    sex: "MALE",
    breed: "Labrador retriever",
    color: "čierny",
    approximateAge: "4 roky",
    size: "LARGE",
    description: "Nájdený pokojný čierny pes pri mestskom parku, čaká na majiteľa.",
    distinguishingMarks: "Malá biela škvrna na hrudi.",
    collarDescription: "Červený obojok.",
    chipped: "UNKNOWN",
    eventDate: "2026-09-28",
    lastSeenDateTime: "",
    region: "Nitriansky kraj",
    district: "Nitra",
    city: "Nitra",
    locationDescription: "Okolie mestského parku.",
    contactName: "E2E Kontakt",
    contactPhone: "+421 900 123 456",
    contactEmail: "lost-found@example.invalid",
    website: "",
    ...overrides,
  };
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, String(value));
  return form;
}

test("public LOST/FOUND normalization keeps contact separate and validates location/date", () => {
  const normalized = normalizePublicLostFoundSubmission(validForm(), new Date("2026-09-29T12:00:00.000Z"));
  assert.equal(normalized.type, "FOUND");
  assert.equal(normalized.region, "Nitriansky kraj");
  assert.equal(normalized.city, "Nitra");
  assert.equal(normalized.contactEmail, "lost-found@example.invalid");
  assert.equal(normalized.normalizedPhone?.includes("421900123456"), true);
  assert.equal(normalized.description.includes("example.invalid"), false);
});

test("public LOST/FOUND rejects future dates, invalid regions and contact leaked into public text", () => {
  assert.throws(
    () => normalizePublicLostFoundSubmission(validForm({ eventDate: "2026-09-30" }), new Date("2026-09-29T12:00:00.000Z")),
    (error) => error instanceof PublicLostFoundSubmissionError && error.code === "INVALID_DATE",
  );
  assert.throws(
    () => normalizePublicLostFoundSubmission(validForm({ region: "Internet" }), new Date("2026-09-29T12:00:00.000Z")),
    (error) => error instanceof PublicLostFoundSubmissionError && error.code === "INVALID_REGION",
  );
  assert.throws(
    () => normalizePublicLostFoundSubmission(validForm({ description: "Nájdený pes, volajte mi prosím na +421 900 123 456 hneď po nájdení." }), new Date("2026-09-29T12:00:00.000Z")),
    (error) => error instanceof PublicLostFoundSubmissionError && error.code === "PRIVATE_DATA_IN_PUBLIC_FIELD",
  );
});

test("LOST requires last-seen time and contact channel", () => {
  assert.throws(
    () => normalizePublicLostFoundSubmission(validForm({ type: "LOST", lastSeenDateTime: "" }), new Date("2026-09-29T12:00:00.000Z")),
    (error) => error instanceof PublicLostFoundSubmissionError && error.code === "MISSING_LAST_SEEN",
  );
  assert.throws(
    () => normalizePublicLostFoundSubmission(validForm({ contactPhone: "", contactEmail: "" }), new Date("2026-09-29T12:00:00.000Z")),
    (error) => error instanceof PublicLostFoundSubmissionError && error.code === "MISSING_CONTACT",
  );
});

test("honeypot is deterministic and same-origin is mandatory for public mutation", () => {
  assert.equal(publicLostFoundHoneypotTriggered(validForm()), false);
  assert.equal(publicLostFoundHoneypotTriggered(validForm({ website: "https://spam.invalid" })), true);

  const sameOrigin = new Request("https://psipedia.sk/api/lost-found/submissions", {
    method: "POST",
    headers: { origin: "https://psipedia.sk", "content-type": "multipart/form-data; boundary=x", "sec-fetch-site": "same-origin" },
  });
  assert.doesNotThrow(() => assertPublicLostFoundMutation(sameOrigin));

  const crossOrigin = new Request("https://psipedia.sk/api/lost-found/submissions", {
    method: "POST",
    headers: { origin: "https://evil.invalid", "content-type": "multipart/form-data; boundary=x", "sec-fetch-site": "cross-site" },
  });
  assert.throws(
    () => assertPublicLostFoundMutation(crossOrigin),
    (error) => error instanceof PublicLostFoundSubmissionError && error.status === 403,
  );
});

test("public intake persists PENDING only, hashes/encrypts PII and never returns internal report identity", () => {
  const store = readFileSync(new URL("../lib/lost-found-public-store.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/lost-found/submissions/route.ts", import.meta.url), "utf8");
  assert.match(store, /'PENDING'/);
  assert.match(store, /published_at IS NULL/);
  assert.match(store, /encryptPii/);
  assert.match(store, /hashPii/);
  assert.match(store, /lost_found_dog_private_details/);
  assert.match(store, /15 \* 60 \* 1000/);
  assert.match(store, /COALESCE\(r\.dog_name,' '\)\?5|COALESCE\(r\.dog_name,''\)=\?5/);
  assert.match(store, /r\.distinguishing_marks=\?7/);
  assert.match(store, /r\.size=\?17/);
  assert.match(route, /enforcePublicLostFoundRateLimits/);
  assert.match(route, /verifyPublicLostFoundTurnstile/);
  assert.match(route, /publicLostFoundHoneypotTriggered/);

  const acceptedStart = route.indexOf("function acceptedResponse");
  const acceptedEnd = route.indexOf("function required", acceptedStart);
  const accepted = route.slice(acceptedStart, acceptedEnd);
  assert.doesNotMatch(accepted, /reportId|PENDING|slug/);
});

test("public DTO/render path cannot carry private contact or private media keys", () => {
  const domain = readFileSync(new URL("../lib/lost-found-dogs.ts", import.meta.url), "utf8");
  const store = readFileSync(new URL("../lib/lost-found-dog-store.ts", import.meta.url), "utf8");
  const detail = readFileSync(new URL("../components/lost-found-dog-detail.tsx", import.meta.url), "utf8");
  const mediaRoute = readFileSync(new URL("../app/media/[...key]/route.ts", import.meta.url), "utf8");

  const publicTypeStart = domain.indexOf("export type PublicDogReport");
  const publicTypeEnd = domain.indexOf("export type AdminDogReport", publicTypeStart);
  const publicType = domain.slice(publicTypeStart, publicTypeEnd);
  assert.doesNotMatch(publicType, /contactName|contactPhone|contactEmail|mainImageKey|private/i);

  const publicSelectStart = store.indexOf("const publicSelect");
  const adminSelectStart = store.indexOf("const adminSelect", publicSelectStart);
  const publicSelect = store.slice(publicSelectStart, adminSelectStart);
  assert.doesNotMatch(publicSelect, /lost_found_dog_private_details|contact_phone|contact_email|private_|main_image_key/i);

  assert.doesNotMatch(detail, /contactPhone|contactEmail|contactName|privateLocation|mainImageKey/);
  assert.match(mediaRoute, /segments\[0\] === "quarantine" \|\| segments\[0\] === "safe"/);
});

test("moderation uses existing LOST_FOUND_CASE foundation and approval precedes domain publication", () => {
  const moderation = readFileSync(new URL("../lib/lost-found-public-moderation.ts", import.meta.url), "utf8");
  const adminRoute = readFileSync(new URL("../app/api/admin/lost-found/[id]/route.ts", import.meta.url), "utf8");
  const attention = readFileSync(new URL("../lib/admin-attention-queue.ts", import.meta.url), "utf8");

  assert.match(moderation, /resourceType: "LOST_FOUND_CASE"/);
  assert.match(moderation, /submitterType: "PUBLIC_REPORTER"/);
  assert.doesNotMatch(moderation, /contactEmail|contactPhone|contactName/);
  assert.match(attention, /LOST_FOUND_CASE: \{ label: "Stratený \/ nájdený pes", href: "\/admin\/stratene-najdene" \}/);

  const syncAt = adminRoute.indexOf("syncLostFoundModerationBeforeAdminStatus");
  const updateAt = adminRoute.indexOf("updateAdminDogReport(", syncAt);
  assert.ok(syncAt >= 0 && updateAt > syncAt, "foundation moderation must be moved before domain publication");
  assert.match(adminRoute, /nextStatus === "ACTIVE"/);
  assert.match(adminRoute, /finalizeLostFoundPublicMedia/);
});

test("public image upload stays private until moderation and 0100 is not created", () => {
  const media = readFileSync(new URL("../lib/lost-found-public-media.ts", import.meta.url), "utf8");
  assert.match(media, /SUBMISSION_UPLOADS/);
  assert.match(media, /ingestPrivateImage/);
  assert.match(media, /safe\/LOST_FOUND_PUBLIC\//);
  assert.match(media, /publishSafeImage/);
  assert.equal(existsSync(new URL("../drizzle/0100_lost_found_public_submission.sql", import.meta.url)), false);
});
