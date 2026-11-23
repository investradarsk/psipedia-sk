import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizePartnerReturnTo } from "../lib/partner-return-to.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("only safe local Partner destinations are retained through registration", () => {
  const lost = "/partner/koncepty/novy?typ=LOST_FOUND_DOG&druh=LOST";
  const found = "/partner/koncepty/novy?typ=LOST_FOUND_DOG&druh=FOUND";
  assert.equal(normalizePartnerReturnTo(lost), lost);
  assert.equal(normalizePartnerReturnTo(found), found);
  assert.equal(normalizePartnerReturnTo("/partner/koncepty/novy?typ=HELP_CASE"), "/partner/koncepty/novy?typ=HELP_CASE");
  for (const unsafe of ["https://evil.example/", "//evil.example/", "/admin", "/api/partner/auth/consume", "/\\evil.example"]) {
    assert.equal(normalizePartnerReturnTo(unsafe), null, unsafe);
  }
});

test("canonical create entry remembers both type and dog report kind before session gate", () => {
  const page = read("app/partner/koncepty/novy/page.tsx");
  const form = read("components/partner-canonical-draft-form.tsx");
  assert.match(page, /const \{typ,druh\}=await searchParams/);
  assert.match(page, /initialType==="LOST_FOUND_DOG"&&\(druh==="LOST"\|\|druh==="FOUND"\)/);
  assert.match(page, /const returnTo="\/partner\/koncepty\/novy\?typ="/);
  assert.match(page, /await requirePartnerPageIdentity\(\{returnTo\}\)/);
  assert.match(page, /initialReportType=\{reportType\?\?undefined\}/);
  assert.match(form, /initialReportType\?:"LOST"\|"FOUND"/);
  assert.match(form, /initial\?\.values\?\?\(initialType==="LOST_FOUND_DOG"&&initialReportType\?\{type:initialReportType\}:\{\}\)/);
  assert.match(form, /const \[values,setValues\]=useState/);
});

test("published dog lists route to the signed-in draft editor, never the anonymous POST", () => {
  const listing = read("components/lost-found-dogs-page.tsx");
  const preset = read("lib/help-banner-presets.ts");
  assert.match(listing, /\/partner\/koncepty\/novy\?typ=LOST_FOUND_DOG&druh=LOST/);
  assert.match(listing, /\/partner\/koncepty\/novy\?typ=LOST_FOUND_DOG&druh=FOUND/);
  assert.doesNotMatch(listing, /lostFoundSubmissionEnabled|stratene-a-najdene\/nahlasit/);
  assert.match(preset, /href: "\/partner\/koncepty\/novy\?typ=LOST_FOUND_DOG"/);
  assert.match(preset, /Prihláste sa alebo si vytvorte účet/);
});

test("all legacy Partner creation aliases defer authentication to the canonical page", () => {
  for (const [path, type] of [
    ["app/partner/profily/novy/page.tsx", "DIRECTORY_PROFILE"],
    ["app/partner/podujatia/nove/page.tsx", "MANAGED_EVENT"],
    ["app/partner/pomoc/nova/page.tsx", "ADOPTION_DOG"],
  ]) {
    const source = read(path);
    assert.match(source, new RegExp("redirect\\(\"/partner/koncepty/novy\\?typ="+type+"\"\\)"));
    assert.doesNotMatch(source, /requirePartnerPageIdentity/);
  }
});

test("password, magic-link, Google and onboarding keep the validated returnTo", () => {
  const password = read("components/partner-password-auth-form.tsx");
  const magic = read("components/partner-auth-form.tsx");
  const verification = read("components/partner-verification.tsx");
  const google = read("lib/partner-google-auth.ts");
  const onboarding = read("components/partner-contact-profile-form.tsx");
  const login = read("app/partner/prihlasenie/page.tsx");
  const register = read("app/partner/registracia/page.tsx");
  assert.match(password, /window\.location\.replace\(destination\(data\.onboardingComplete, returnTo\)\)/);
  assert.match(magic, /body: JSON\.stringify\(\{ email, turnstileToken, returnTo/);
  assert.match(verification, /window\.location\.replace\(returnTo \|\| "\/partner"\)/);
  assert.match(google, /postAuthTarget\(onboardingComplete,flow\.returnTo\)/);
  assert.match(onboarding, /window\.location\.replace\(returnTo \|\| "\/partner"\)/);
  assert.match(login, /majiteľov psov, ktorí chcú spravovať vlastné hlásenia/);
  assert.match(register, /Organizáciu ani firmu mať nemusíte/);
  assert.match(magic, /<span>E-mail<\/span>/);
});

test("current anonymous intake stays intact for existing submissions until step 3 cutover", () => {
  const oldPage = read("app/pomoc-psom/stratene-a-najdene/nahlasit/page.tsx");
  const oldApi = read("app/api/lost-found/submissions/route.ts");
  assert.match(oldPage, /LostFoundSubmissionForm/);
  assert.match(oldApi, /ensurePendingLostFoundModeration/);
  assert.match(oldApi, /createPendingPublicLostFoundDogReport/);
});
