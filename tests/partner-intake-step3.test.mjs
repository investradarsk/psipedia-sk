import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getPartnerLostFoundSubmitIssue,
  partnerLostFoundTimeForInput,
  partnerLostFoundTimeForSave,
} from "../lib/partner-lost-found-intake.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const NOW = new Date("2026-11-23T12:00:00.000Z");
const good = {
  type: "LOST",
  event_date: "2026-11-22",
  region: "Žilinský kraj",
  city: "Oravská Polhora",
  description: "Mia zmizla pri chodníku a bola videná v okolí obce.",
  last_seen_date_time: "2026-11-22T16:00:00.000Z",
};

test("partner-owned dog intake requires the historic essential fields only when submitting", () => {
  assert.equal(getPartnerLostFoundSubmitIssue(good, NOW), null);
  assert.equal(getPartnerLostFoundSubmitIssue({ ...good, type: "FOUND", last_seen_date_time: "" }, NOW), null);
  const invalidCases = [
    [{ ...good, type: "" }, "type"],
    [{ ...good, event_date: "" }, "event_date"],
    [{ ...good, event_date: "2099-12-01" }, "event_date"],
    [{ ...good, event_date: "2026-02-30" }, "event_date"],
    [{ ...good, region: "" }, "region"],
    [{ ...good, city: "" }, "city"],
    [{ ...good, description: "Krátky opis" }, "description"],
    [{ ...good, last_seen_date_time: "" }, "last_seen_date_time"],
    [{ ...good, last_seen_date_time: "invalid" }, "last_seen_date_time"],
    [{ ...good, last_seen_date_time: "2099-01-01T00:00:00Z" }, "last_seen_date_time"],
  ];
  for (const [payload, field] of invalidCases) {
    const issue = getPartnerLostFoundSubmitIssue(payload, NOW);
    assert.equal(issue?.field, field, String(field));
    assert.ok(issue?.message);
  }
});

test("last-seen local time is converted to ISO UTC for summer and winter Slovakia", () => {
  assert.equal(partnerLostFoundTimeForInput("2026-11-22T16:00:00.000Z"), "2026-11-22T17:00");
  assert.equal(partnerLostFoundTimeForSave("2026-11-22T17:00"), "2026-11-22T16:00:00.000Z");
  assert.equal(partnerLostFoundTimeForInput("2026-06-21T15:00:00.000Z"), "2026-06-21T17:00");
  assert.equal(partnerLostFoundTimeForSave("2026-06-21T17:00"), "2026-06-21T15:00:00.000Z");
  assert.equal(partnerLostFoundTimeForSave(""), "");
});

test("Partner report uses account/private chat, not the public email or phone as identity", () => {
  const page = read("app/partner/koncepty/novy/page.tsx");
  const form = read("components/partner-canonical-draft-form.tsx");
  const definition = read("lib/partner-canonical-form-fields.ts");
  const workflow = read("lib/partner-canonical-workflow.ts");
  assert.match(page, /requirePartnerPageIdentity/);
  assert.match(form, /Súkromný kontakt/);
  assert.match(form, /Údaje z účtu sa do verejných kontaktov neprenášajú/);
  assert.match(form, /getPartnerLostFoundSubmitIssue\(payload\(\)\)/);
  assert.match(form, /partnerLostFoundTimeForInput/);
  assert.match(form, /partnerLostFoundTimeForSave/);
  assert.match(definition, /last_seen_date_time"[\s\S]*?kind:"datetime-local"/);
  assert.match(workflow, /getPartnerLostFoundSubmitIssue\(draft.values/);
  assert.match(workflow, /INCOMPLETE_LOST_FOUND_REPORT/);
  assert.match(workflow, /status IN \('draft','DRAFT'\) AND updated_at=\?/);
  assert.match(workflow, /sex:"UNKNOWN",size:"UNKNOWN",chipped:"UNKNOWN",public_location_precision:"MUNICIPALITY"/);
  assert.doesNotMatch(workflow, /partner_account_profiles[\s\S]{0,120}public_(?:email|phone)/i);
});

test("legacy anonymous endpoint cannot write while existing private-report helpers remain untouched", () => {
  const page = read("app/pomoc-psom/stratene-a-najdene/nahlasit/page.tsx");
  const endpoint = read("app/api/lost-found/submissions/route.ts");
  const legacyStore = read("lib/lost-found-public-store.ts");
  const moderation = read("lib/lost-found-public-moderation.ts");
  assert.match(page, /redirect\(target\)/);
  assert.match(endpoint, /PARTNER_ACCOUNT_REQUIRED/);
  assert.match(endpoint, /status: 410/);
  assert.doesNotMatch(endpoint, /formData|createPendingPublicLostFoundDogReport|ensurePendingLostFoundModeration|\.prepare\(/);
  assert.match(legacyStore, /lost_found_dog_private_details/);
  assert.match(moderation, /submitterType: "PUBLIC_REPORTER"/);
});
