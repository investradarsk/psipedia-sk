import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = path => readFileSync(new URL(path, import.meta.url), "utf8");

test("all directory categories ignore blank optional fields and verify save response", () => {
  const editor = source("../components/admin-directory-editor.tsx");
  assert.match(editor, /validity\.valueMissing/);
  assert.match(editor, /data\.profile\.status !== nextStatus/);
  assert.match(editor, /Verejný web sa po uložení nepotvrdil/);
  assert.match(source("../lib/directory-store.ts"), /if \(!name\) throw new Error/);
});

test("breed, Help and event publication accept missing editorial content", () => {
  const breed = source("../lib/breed-store.ts");
  assert.doesNotMatch(breed, /Publikované plemeno musí mať FCI číslo a importný kľúč/);
  assert.doesNotMatch(source("../components/admin-breed-editor.tsx"), /if \(!form\.intro\.trim\(\)\)/);

  const help = source("../lib/help-store.ts");
  for (const guarded of [/status === "published" && !organization/, /status === "published" && !city/, /status === "published" && excerpt\.length < 20/])
    assert.doesNotMatch(help, guarded);
  assert.match(help, /!verified \|\| \(goalAmount !== null/);

  const events = source("../lib/event-store.ts");
  assert.match(events, /if \(startDate && !validDate\(startDate\)\)/);
  assert.doesNotMatch(events, /status === "published" && !organizer/);
  assert.doesNotMatch(events, /status === "published" && !region/);
});

test("adoption and lost-found allow missing publish fields while retaining identity and privacy checks", () => {
  const adoption = source("../lib/adoption.ts");
  assert.match(adoption, /if \(!dog\.name\)/);
  assert.match(adoption, /if \(!dog\.slug\)/);
  assert.doesNotMatch(adoption, /if \(!dog\.region \|\| !dog\.city\)/);
  assert.doesNotMatch(source("../lib/adoption-store.ts"), /Verejný adopčný profil musí mať canonical organization_id/);

  const lost = source("../lib/lost-found-dog-store.ts");
  assert.doesNotMatch(lost, /if \(status !== "DRAFT"\) \{/);
  assert.match(lost, /if \(eventDate && !\/\^\\d\{4\}/);
  assert.match(lost, /requirePiiKeys/);
});

test("empty e-shop web, source and description never produce invalid public links", () => {
  const shop = source("../lib/eshop-ratings.ts");
  assert.match(shop, /return normalizedOptionalUrl\(value, label\) \?\? ""/);
  assert.match(shop, /normalizedOptionalText\(input\.description/);
  const publicPage = source("../app/recenzie/eshopy/[slug]/page.tsx");
  assert.match(publicPage, /shop\.websiteUrl \? \(/);
  assert.match(publicPage, /shop\.sourceUrl \? \(/);
});

test("organizations keep missing content as warnings rather than blockers", () => {
  const organization = source("../lib/help-organization-publication.ts");
  assert.match(organization, /warnings\.push\(\{ code: "MISSING_DESCRIPTION"/);
  assert.match(organization, /warnings\.push\(\{ code: "MISSING_LOCATION"/);
  assert.match(organization, /warnings\.push\(\{ code: "MISSING_CONTACT"/);
  assert.match(organization, /ready: blockers\.length === 0/);
});
