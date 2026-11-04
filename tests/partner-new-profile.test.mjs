import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const read = (path) => fs.readFile(new URL("../" + path, import.meta.url), "utf8");
const importTs = (path) => import(pathToFileURL(new URL(path, root).pathname).href);

const [
  migration,
  domain,
  admin,
  partnerApi,
  scanApi,
  withdrawApi,
  adminApi,
  attention,
  attentionStore,
  partnerAttention,
  email,
  platform,
  directory,
  helpWrite,
  profilesPage,
  requestsPage,
  newPage,
  legacyDirectory,
  newForm,
  locationSelector,
  partnerCss,
  profileChanges,
] = await Promise.all(
  [
    "drizzle/0066_partner_new_profile_submissions.sql",
    "lib/partner-new-profile.ts",
    "lib/partner-new-profile-admin.ts",
    "app/api/partner/new-profile/route.ts",
    "app/api/partner/new-profile/scan/route.ts",
    "app/api/partner/new-profile/[id]/withdraw/route.ts",
    "app/api/admin/partners/submissions/[id]/route.ts",
    "lib/admin-attention-queue.ts",
    "lib/admin-attention-queue-store.ts",
    "lib/partner-attention.ts",
    "lib/partner-email.ts",
    "lib/partner-platform.ts",
    "lib/directory-store.ts",
    "lib/help-organization-admin-write.ts",
    "app/partner/profily/page.tsx",
    "app/partner/ziadosti/page.tsx",
    "app/partner/profily/novy/page.tsx",
    "lib/directory-store.ts",
    "components/partner-new-profile-form.tsx",
    "components/slovakia-location-selector.tsx",
    "app/partner/partner.css",
    "lib/partner-profile-changes.ts",
  ].map(read),
);

test("0066 is a 1:1 metadata extension without a parallel workflow status", () => {
  assert.match(migration, /CREATE\s*TABLE\s*`partner_new_profile_metadata`/);
  assert.match(
    migration,
    /`submission_id`\s*text\s*PRIMARY\s*KEY\s*NOT\s*NULL\s*REFERENCES\s*`moderation_submissions`/,
  );
  assert.match(migration, /partner_new_profile_active_identity_unique/);
  assert.match(migration, /WHERE\s*`dedupe_active`=1/);
  assert.match(migration, /CREATED_NEW/);
  assert.match(migration, /LINKED_EXISTING/);
  const ddl = migration.slice(
    migration.indexOf("CREATE TABLE `partner_new_profile_metadata`"),
    migration.indexOf(");", migration.indexOf("CREATE TABLE `partner_new_profile_metadata`")) + 2,
  );
  assert.doesNotMatch(ddl, /`status`/);
  assert.match(migration, /partner_audit_events_no_update/);
  assert.match(migration, /partner_audit_events_no_delete/);
});

test("new profile submission reuses generic CREATE moderation and never writes canonical rows", () => {
  const submit = domain.slice(
    domain.indexOf("export async function submitPartnerNewProfile"),
    domain.indexOf("function statusLabel"),
  );
  assert.match(submit, /INSERT\s*INTO\s*moderation_submissions/);
  assert.match(submit, /NULL,\s*'CREATE',\s*'SUBMITTED',\s*'PARTNER_ACCOUNT'/);
  assert.match(submit, /INSERT\s*INTO\s*partner_new_profile_metadata/);
  assert.match(submit, /NEW_PROFILE_SUBMITTED/);
  assert.match(submit, /scanPartnerNewProfileForAccount/);
  assert.match(submit, /duplicate_resource_type,\s*duplicate_subject_id/);
  assert.doesNotMatch(
    submit,
    /INSERT\s*INTO\s*directory_profiles|INSERT\s*INTO\s*help_organizations|UPDATE\s*directory_profiles|UPDATE\s*help_organizations/i,
  );
});

test("new profile Partner mutations require active session and same-origin guard", () => {
  for (const route of [partnerApi, scanApi, withdrawApi]) {
    assert.match(route, /requirePartnerAccount/);
    assert.match(route, /assertPartnerJsonMutation/);
    assert.match(route, /cookieHeader:\s*request\s*\.headers\s*\.get\(\s*"cookie"\s*\)/);
  }
  assert.match(adminApi, /requirePartnerAdminMutation/);
  assert.doesNotMatch(adminApi, /requirePartnerAccount/);
});

test("Directory self-service categories use current public list and reject legacy categories", async () => {
  const { normalizePartnerNewProfile } = await importTs("lib/partner-new-profile.ts");
  const base = {
    name: "Test Veterina",
    category: "veterinari",
    excerpt: "Krátky popis dostatočnej dĺžky.",
    description: "Toto je dostatočne dlhý verejný popis testovacieho profilu.",
    services: [],
    qualifications: [],
    city: "Nitra",
    district: "Nitra",
    region: "Nitriansky kraj",
    address: "Hlavná 1",
    priceNote: "",
    websiteUrl: "",
    publicPhone: "",
    publicEmail: "info@example.sk",
    facebookUrl: "",
    instagramUrl: "",
  };
  assert.equal(normalizePartnerNewProfile("DIRECTORY_PROFILE", base).categoryOrType, "veterinari");
  for (const category of ["psie-skoly", "utulky-a-zachrana"]) {
    assert.throws(
      () => normalizePartnerNewProfile("DIRECTORY_PROFILE", { ...base, category }),
      /podporovanú kategóriu/,
    );
  }
});

test("canonical Slovakia dataset drives dependent region, district and municipality choices", async () => {
  const locations = await importTs("lib/slovakia-locations.ts");
  assert.equal(locations.SLOVAK_REGIONS.length, 8);
  assert.equal(Object.keys(locations.SLOVAK_MUNICIPALITIES_BY_DISTRICT).length, 79);
  assert.equal(locations.SLOVAK_MUNICIPALITY_COUNT, 2927);
  assert.deepEqual(locations.getSlovakDistricts("Nitriansky kraj"), [
    "Komárno",
    "Levice",
    "Nitra",
    "Nové Zámky",
    "Šaľa",
    "Topoľčany",
    "Zlaté Moravce",
  ]);
  const zlateMoravce = locations.getSlovakMunicipalities("Zlaté Moravce");
  for (const municipality of ["Zlaté Moravce", "Beladice", "Neverice", "Tesárske Mlyňany"]) {
    assert.ok(zlateMoravce.includes(municipality), municipality);
  }
  assert.deepEqual(
    locations.resolveSlovakLocation({
      region: "Nitriansky kraj",
      district: "Zlaté Moravce",
      city: "Neverice",
    }),
    { region: "Nitriansky kraj", district: "Zlaté Moravce", city: "Neverice" },
  );
  assert.equal(
    locations.resolveSlovakLocation({
      region: "Trnavský kraj",
      district: "Poprad",
      city: "Zlaté Moravce",
    }),
    null,
  );
  assert.ok(
    locations.searchSlovakMunicipalities("Zlaté Moravce", "tesarske").includes("Tesárske Mlyňany"),
  );
});

test("server rejects inconsistent Slovak new-profile locations", async () => {
  const { normalizePartnerNewProfile } = await importTs("lib/partner-new-profile.ts");
  const base = {
    name: "Test Veterina",
    category: "veterinari",
    excerpt: "Krátky popis dostatočnej dĺžky.",
    description: "Toto je dostatočne dlhý verejný popis testovacieho profilu.",
    services: [],
    qualifications: [],
    city: "Zlaté Moravce",
    district: "Zlaté Moravce",
    region: "Nitriansky kraj",
    address: "Hlavná 1",
    priceNote: "",
    websiteUrl: "",
    publicPhone: "",
    publicEmail: "info@example.sk",
    facebookUrl: "",
    instagramUrl: "",
  };
  assert.equal(normalizePartnerNewProfile("DIRECTORY_PROFILE", base).values.city, "Zlaté Moravce");
  assert.throws(
    () =>
      normalizePartnerNewProfile("DIRECTORY_PROFILE", {
        ...base,
        district: "Poprad",
        region: "Trnavský kraj",
      }),
    /platnú obec\/mesto, okres a kraj/,
  );

  const help = {
    name: "OZ Test",
    type: "CIVIC_ASSOCIATION",
    legalName: "",
    registrationNumber: "",
    shortDescription: "",
    description: "",
    publicEmail: "info@example.sk",
    publicPhone: "",
    websiteUrl: "",
    facebookUrl: "",
    instagramUrl: "",
    address: "Hlavná 1",
    city: "Neverice",
    district: "Zlaté Moravce",
    region: "Nitriansky kraj",
    countryCode: "SK",
  };
  assert.equal(normalizePartnerNewProfile("HELP_ORGANIZATION", help).values.city, "Neverice");
  assert.throws(
    () => normalizePartnerNewProfile("HELP_ORGANIZATION", { ...help, district: "Poprad" }),
    /platnú obec\/mesto, okres a kraj/,
  );
  assert.equal(
    normalizePartnerNewProfile("HELP_ORGANIZATION", {
      ...help,
      countryCode: "CZ",
      city: "Praha",
      district: "Praha",
      region: "Hlavní město Praha",
    }).values.region,
    "Hlavní město Praha",
  );
});

test("server field allowlist rejects system and unknown fields", async () => {
  const { normalizePartnerNewProfile } = await importTs("lib/partner-new-profile.ts");
  const base = {
    name: "Test Veterina",
    category: "veterinari",
    excerpt: "Krátky popis dostatočnej dĺžky.",
    description: "Toto je dostatočne dlhý verejný popis testovacieho profilu.",
    services: [],
    qualifications: [],
    city: "Nitra",
    district: "Nitra",
    region: "Nitriansky kraj",
    address: "Hlavná 1",
    priceNote: "",
    websiteUrl: "",
    publicPhone: "",
    publicEmail: "info@example.sk",
    facebookUrl: "",
    instagramUrl: "",
  };
  for (const key of [
    "slug",
    "status",
    "verified",
    "featured",
    "sourceDataJson",
    "searchText",
    "imageUrl",
    "publishedAt",
    "online",
    "unknownField",
  ]) {
    assert.throws(
      () => normalizePartnerNewProfile("DIRECTORY_PROFILE", { ...base, [key]: "x" }),
      /nie je možné/,
    );
  }
});

test("CREATE required contract enforces directory address, full Slovak location and email OR phone OR web", async () => {
  const { normalizePartnerNewProfile } = await importTs("lib/partner-new-profile.ts");
  const base = {
    name: "Test Veterina",
    category: "veterinari",
    excerpt: "Krátky popis dostatočnej dĺžky.",
    description: "",
    services: [],
    qualifications: [],
    city: "Nitra",
    district: "Nitra",
    region: "Nitriansky kraj",
    address: "Hlavná 1",
    priceNote: "",
    websiteUrl: "",
    publicPhone: "",
    publicEmail: "info@example.sk",
    facebookUrl: "",
    instagramUrl: "",
  };
  assert.equal(normalizePartnerNewProfile("DIRECTORY_PROFILE", base).values.description, "");
  assert.throws(
    () => normalizePartnerNewProfile("DIRECTORY_PROFILE", { ...base, name: "" }),
    /Názov/,
  );
  assert.throws(
    () => normalizePartnerNewProfile("DIRECTORY_PROFILE", { ...base, category: "" }),
    /kategóriu/,
  );
  assert.throws(
    () => normalizePartnerNewProfile("DIRECTORY_PROFILE", { ...base, excerpt: "príliš krátke" }),
    /príliš krátky/,
  );
  assert.doesNotThrow(() =>
    normalizePartnerNewProfile("DIRECTORY_PROFILE", { ...base, excerpt: "12345678901234567890" }),
  );
  assert.throws(
    () => normalizePartnerNewProfile("DIRECTORY_PROFILE", { ...base, address: "" }),
    /Adresa je povinná/,
  );
  for (const key of ["region", "district", "city"]) {
    assert.throws(
      () => normalizePartnerNewProfile("DIRECTORY_PROFILE", { ...base, [key]: "" }),
      /Vyberte/,
    );
  }
  const noContact = { ...base, publicEmail: "", publicPhone: "", websiteUrl: "" };
  assert.throws(
    () => normalizePartnerNewProfile("DIRECTORY_PROFILE", noContact),
    /aspoň jeden verejný kontakt/,
  );
  assert.doesNotThrow(() =>
    normalizePartnerNewProfile("DIRECTORY_PROFILE", { ...noContact, publicEmail: "a@b.sk" }),
  );
  assert.doesNotThrow(() =>
    normalizePartnerNewProfile("DIRECTORY_PROFILE", {
      ...noContact,
      publicPhone: "+421 900 111 222",
    }),
  );
  assert.doesNotThrow(() =>
    normalizePartnerNewProfile("DIRECTORY_PROFILE", {
      ...noContact,
      websiteUrl: "https://example.sk",
    }),
  );
  assert.throws(
    () =>
      normalizePartnerNewProfile("DIRECTORY_PROFILE", {
        ...noContact,
        facebookUrl: "https://facebook.com/test",
      }),
    /aspoň jeden verejný kontakt/,
  );
  assert.throws(
    () =>
      normalizePartnerNewProfile("DIRECTORY_PROFILE", {
        ...noContact,
        instagramUrl: "https://instagram.com/test",
      }),
    /aspoň jeden verejný kontakt/,
  );
  assert.throws(
    () => normalizePartnerNewProfile("DIRECTORY_PROFILE", { ...base, publicEmail: "zly-email" }),
    /platný formát/,
  );
  assert.throws(
    () => normalizePartnerNewProfile("DIRECTORY_PROFILE", { ...base, publicPhone: "CALL-ME" }),
    /platný formát/,
  );
  assert.throws(
    () => normalizePartnerNewProfile("DIRECTORY_PROFILE", { ...base, websiteUrl: "example.sk" }),
    /platná URL/,
  );
});

test("CREATE required contract enforces help organization SK fields and preserves non-SK fallback", async () => {
  const { normalizePartnerNewProfile } = await importTs("lib/partner-new-profile.ts");
  const base = {
    name: "OZ Test",
    type: "CIVIC_ASSOCIATION",
    legalName: "",
    registrationNumber: "",
    shortDescription: "",
    description: "",
    publicEmail: "info@example.sk",
    publicPhone: "",
    websiteUrl: "",
    facebookUrl: "",
    instagramUrl: "",
    address: "Hlavná 1",
    city: "Neverice",
    district: "Zlaté Moravce",
    region: "Nitriansky kraj",
    countryCode: "SK",
  };
  assert.doesNotThrow(() => normalizePartnerNewProfile("HELP_ORGANIZATION", base));
  assert.throws(
    () => normalizePartnerNewProfile("HELP_ORGANIZATION", { ...base, address: "" }),
    /Adresa je povinná/,
  );
  assert.throws(
    () => normalizePartnerNewProfile("HELP_ORGANIZATION", { ...base, city: "" }),
    /Vyberte obec alebo mesto/,
  );
  assert.throws(
    () =>
      normalizePartnerNewProfile("HELP_ORGANIZATION", {
        ...base,
        publicEmail: "",
        publicPhone: "",
        websiteUrl: "",
      }),
    /aspoň jeden verejný kontakt/,
  );
  assert.doesNotThrow(() =>
    normalizePartnerNewProfile("HELP_ORGANIZATION", {
      ...base,
      countryCode: "CZ",
      city: "",
      district: "",
      region: "",
      address: "Pražská 1",
      publicEmail: "",
      websiteUrl: "https://example.cz",
    }),
  );
});

test("new-profile UX mirrors limits, exposes inline errors and preserves media state on validation failures", () => {
  assert.match(newForm, /Polia\s*označené/);
  assert.match(newForm, /Krátky\s*popis<RequiredMark/);
  assert.match(newForm, /Adresa<RequiredMark/);
  assert.match(newForm, /Kontakt<RequiredMark/);
  assert.match(newForm, /Vyplňte\s*aspoň\s*jeden:\s*e-mail,\s*telefón\s*alebo\s*web\s*\./);
  assert.match(newForm, /20–700\s*znakov/);
  assert.match(newForm, /Max\s*\.\s*20\s*000\s*znakov/);
  assert.match(newForm, /maxLength=\{\s*180\s*\}/);
  assert.match(newForm, /maxLength=\{\s*300\s*\}/);
  assert.match(newForm, /maxLength=\{\s*1200\s*\}/);
  assert.match(newForm, /maxLength=\{\s*320\s*\}/);
  assert.match(newForm, /maxLength=\{\s*100\s*\}/);
  assert.match(newForm, /Skontrolujte\s*označené\s*polia\s*\./);
  assert.match(newForm, /aria-invalid/);
  assert.match(newForm, /aria-describedby/);
  assert.match(newForm, /data-field-error/);
  assert.match(newForm, /querySelector<HTMLElement>\(\s*'\[\s*data-field-error="true"\s*\]'\s*\)/);
  assert.match(newForm, /noValidate/);
  assert.match(newForm, /PartnerMediaField/);
  assert.doesNotMatch(newForm, /setMediaAssetId\(\s*null\s*\)/);
  assert.match(locationSelector, /Kraj\{\s*requiredMark\s*\}/);
  assert.match(locationSelector, /Okres\{\s*requiredMark\s*\}/);
  assert.match(locationSelector, /Obec\s*\/\s*mesto\{\s*requiredMark\s*\}/);
  assert.match(locationSelector, /ArrowDown/);
  assert.match(locationSelector, /ArrowUp/);
  assert.match(locationSelector, /Escape/);
  assert.match(partnerCss, /@media\s*\(\s*max-width:\s*760px\s*\)/);
  assert.match(partnerCss, /partner-contact-grid\s*\{\s*grid-template-columns:\s*1fr;?\s*\}/);
  assert.match(partnerCss, /partner-field\s*input\[\s*aria-invalid="true"\s*\]/);
});

test("directory long description is optional for CREATE and remains bounded at 20k in shared validation", () => {
  assert.match(
    profileChanges,
    /\{\s*key:\s*"description",\s*label:\s*"Popis",\s*kind:\s*"textarea"\s*\}/,
  );
  assert.match(profileChanges, /textValue\(\s*value,\s*"Popis",\s*20_000\s*\)/);
  assert.doesNotMatch(
    profileChanges,
    /textValue\(\s*value,\s*"Popis",\s*20_000,\s*true,\s*40\s*\)/,
  );
});

test("Partner admin canonical draft and regular canonical editor both preserve optional directory description", async () => {
  const { normalizeManagedDirectoryProfileInput } = await importTs("lib/directory-store.ts");
  const payload = {
    slug: "partner-optional-description",
    name: "Partner Optional Description",
    category: "veterinari",
    status: "draft",
    excerpt: "",
    description: "",
    city: "",
    district: "",
    region: "",
    address: "",
    services: [],
    qualifications: [],
    websiteUrl: "https://example.sk",
    publicEmail: "info@example.sk",
    publicPhone: "",
    facebookUrl: "",
    instagramUrl: "",
  };
  const normalized = normalizeManagedDirectoryProfileInput(payload);
  assert.equal(normalized.description, "");
  assert.equal(normalized.excerpt, "");
  assert.equal(normalized.city, "");
  assert.equal(normalized.region, "");
  const partnerNormalized = normalizeManagedDirectoryProfileInput(payload, null, {
    descriptionOptional: true,
  });
  assert.equal(partnerNormalized.description, "");
  assert.match(admin, /descriptionOptional:\s*true/);
});

test("duplicate normalizers are deterministic and conservative", async () => {
  const mod = await importTs("lib/partner-new-profile.ts");
  assert.equal(mod.normalizeDuplicateName("  Veterína ÁBC, s.r.o. "), "veterina abc s r o");
  assert.equal(mod.normalizeDuplicateDomain("https://www.Example.SK/path"), "example.sk");
  assert.equal(mod.normalizeDuplicatePhone("+421 905 123 456"), "421905123456");
  assert.equal(mod.normalizeDuplicatePhone("0905 123 456"), "421905123456");
  assert.equal(mod.normalizeDuplicateEmail(" INFO@Example.SK "), "info@example.sk");
  assert.equal(mod.normalizeDuplicateRegistration(" IČO 12-34 "), "ICO1234");
});

function score(mod, overrides = {}, candidateOverrides = {}) {
  const incoming = {
    name: "Veterina ABC",
    websiteUrl: "https://veterina-abc.sk",
    publicPhone: "+421905123456",
    publicEmail: "info@veterina-abc.sk",
    registrationNumber: "12345678",
    address: "Hlavná 1",
    city: "Nitra",
    ...overrides,
  };
  return mod.evaluatePartnerDuplicateCandidate({
    resourceType: "DIRECTORY_PROFILE",
    incoming,
    categoryOrType: "veterinari",
    canonicalId: 42,
    name: "Iný názov",
    categoryOrTypeCandidate: "veterinari",
    city: "Bratislava",
    address: "Iná 2",
    websiteUrl: "https://other.sk",
    publicPhone: "+421911000000",
    publicEmail: "other@example.sk",
    registrationNumber: "",
    status: "published",
    slug: "profil",
    published: true,
    ...candidateOverrides,
  });
}

test("exact website, phone and email are HIGH duplicate signals", async () => {
  const mod = await importTs("lib/partner-new-profile.ts");
  assert.equal(
    score(mod, {}, { websiteUrl: "https://www.veterina-abc.sk/iné" }).confidence,
    "HIGH",
  );
  assert.equal(score(mod, {}, { publicPhone: "0905 123 456" }).confidence, "HIGH");
  assert.equal(score(mod, {}, { publicEmail: "INFO@VETERINA-ABC.SK" }).confidence, "HIGH");
});

test("organization registration number is a HIGH signal", async () => {
  const mod = await importTs("lib/partner-new-profile.ts");
  const candidate = mod.evaluatePartnerDuplicateCandidate({
    resourceType: "HELP_ORGANIZATION",
    incoming: {
      name: "OZ Pes",
      registrationNumber: "12 345 678",
      websiteUrl: "",
      publicPhone: "",
      publicEmail: "",
      address: "",
      city: "",
    },
    categoryOrType: "CIVIC_ASSOCIATION",
    canonicalId: 7,
    name: "Iné OZ",
    categoryOrTypeCandidate: "CIVIC_ASSOCIATION",
    city: "",
    address: "",
    websiteUrl: "",
    publicPhone: "",
    publicEmail: "",
    registrationNumber: "12345678",
    status: "PUBLISHED",
    slug: "ine-oz",
    published: true,
  });
  assert.equal(candidate.confidence, "HIGH");
  assert.ok(candidate.reasons.includes("Rovnaké registračné číslo"));
});

test("name plus address is HIGH, exact name plus city/category is MEDIUM, weak name-only is not a match", async () => {
  const mod = await importTs("lib/partner-new-profile.ts");
  assert.equal(
    score(
      mod,
      { websiteUrl: "", publicPhone: "", publicEmail: "" },
      {
        name: "Veterína ABC",
        address: "Hlavna 1",
        city: "Košice",
        websiteUrl: "",
        publicPhone: "",
        publicEmail: "",
      },
    ).confidence,
    "HIGH",
  );
  assert.equal(
    score(
      mod,
      { websiteUrl: "", publicPhone: "", publicEmail: "", address: "Iná adresa" },
      {
        name: "Veterína ABC",
        address: "Úplne iná",
        city: "Nitra",
        websiteUrl: "",
        publicPhone: "",
        publicEmail: "",
      },
    ).confidence,
    "MEDIUM",
  );
  assert.equal(
    score(
      mod,
      { websiteUrl: "", publicPhone: "", publicEmail: "", address: "", city: "Nitra" },
      {
        name: "Veterina ABC Plus",
        address: "",
        city: "Košice",
        websiteUrl: "",
        publicPhone: "",
        publicEmail: "",
      },
    ),
    null,
  );
});

test("HIGH duplicate requires explicit Partner confirmation and server rescans on submit", () => {
  assert.match(domain, /scanPartnerNewProfileForAccount\(\s*\{\s*/);
  assert.match(
    domain,
    /scan\s*\.confidence\s*===\s*"HIGH"\s*&&\s*input\s*\.confirmDuplicate\s*!==\s*true/,
  );
  assert.match(domain, /DUPLICATE_CONFIRMATION_REQUIRED/);
  assert.match(domain, /Rovnaký\s*návrh\s*nového\s*profilu\s*už\s*čaká/);
  assert.match(newPage, /PartnerNewProfileForm/);
});

test("admin CREATE resolution is atomic, DRAFT-only and reuses canonical create primitives", () => {
  const create = admin.slice(
    admin.indexOf("export async function createPartnerNewProfileAdmin"),
    admin.indexOf("export async function linkPartnerNewProfileAdmin"),
  );
  const membershipHelper = admin.slice(
    admin.indexOf("function membershipStatements"),
    admin.indexOf("function verificationStatements"),
  );
  const verificationHelper = admin.slice(
    admin.indexOf("function verificationStatements"),
    admin.indexOf("function resolutionMetadataStatement"),
  );
  const directoryCreate = directory.slice(
    directory.indexOf("export function buildManagedDirectoryProfileCreateStatement"),
    directory.indexOf("export async function getPublishedDirectoryProfiles"),
  );
  const organizationCreate = helpWrite.slice(
    helpWrite.indexOf("export function buildOrganizationCreateStatement"),
    helpWrite.indexOf("export async function createOrganizationFromAdmin"),
  );
  assert.match(create, /buildManagedDirectoryProfileCreateStatement/);
  assert.match(create, /buildOrganizationCreateStatement/);
  assert.match(create, /status:"draft"/);
  assert.match(create, /membershipStatements/);
  assert.match(create, /assertNewProfileIndependentOwnershipApprover/);
  assert.ok(
    create.indexOf("assertNewProfileIndependentOwnershipApprover") <
      create.indexOf("applyAtomicModerationTransition"),
  );
  assert.match(membershipHelper, /MEMBERSHIP_CREATED/);
  assert.match(create, /verificationStatements/);
  assert.match(verificationHelper, /VERIFICATION_REQUESTED/);
  assert.match(verificationHelper, /PENDING_VERIFICATION/);
  assert.match(create, /applyAtomicModerationTransition/);
  assert.match(create, /toStatus:"APPROVED"/);
  assert.match(create, /extraStatements:canonicalStatements/);
  assert.match(create, /NEW_PROFILE_CREATED/);
  assert.match(create, /resolution:"CREATED_NEW"/);
  assert.doesNotMatch(create, /status:"published"|status:'published'|status:"PUBLISHED"/);
  assert.match(directoryCreate, /guardedSelectValues\s*=\s*\[\s*/);
  assert.match(directoryCreate, /"\?",\s*"\?",\s*"\?",\s*"'draft'"/);
  assert.match(directoryCreate, /"NULL",\s*"\?",\s*"\?"/);
  assert.match(
    directoryCreate,
    /WHERE\s*id=\?\s*AND\s*status='APPROVED'\s*AND\s*reviewed_at=\?\s*AND\s*reviewed_by=\?/,
  );
  assert.match(organizationCreate, /VALUES\s*\(\s*\?,\s*\?,\s*\?,\s*\?,\s*\?,\s*'DRAFT'/);
  assert.match(organizationCreate, /SELECT\s*\?,\s*\?,\s*\?,\s*\?,\s*\?,\s*'DRAFT'/);
});

test("LINK EXISTING creates no canonical row, preserves owner semantics and hands off verification", () => {
  const link = admin.slice(
    admin.indexOf("export async function linkPartnerNewProfileAdmin"),
    admin.indexOf("export async function rejectPartnerNewProfileAdmin"),
  );
  assert.match(link, /canonicalExists/);
  assert.match(link, /resourceAnchorStatement/);
  assert.match(link, /assertNewProfileIndependentOwnershipApprover/);
  assert.match(link, /targetResource/);
  assert.ok(
    link.indexOf("assertNewProfileIndependentOwnershipApprover") <
      link.indexOf("applyAtomicModerationTransition"),
  );
  assert.match(link, /membershipStatements/);
  assert.match(link, /verificationStatements/);
  assert.match(link, /resolution:"LINKED_EXISTING"/);
  assert.match(link, /NEW_PROFILE_LINKED_EXISTING/);
  assert.doesNotMatch(
    link,
    /buildManagedDirectoryProfileCreateStatement|buildOrganizationCreateStatement/,
  );
  assert.doesNotMatch(link, /DELETE\s*FROM\s*partner_memberships|revoked_at=/i);
});

test("REJECT and WITHDRAW never create canonical rows or memberships", () => {
  const reject = admin.slice(admin.indexOf("export async function rejectPartnerNewProfileAdmin"));
  const withdraw = domain.slice(domain.indexOf("export async function withdrawPartnerNewProfile"));
  assert.match(reject, /toStatus:"REJECTED"/);
  assert.match(reject, /NEW_PROFILE_REJECTED/);
  assert.doesNotMatch(
    reject,
    /buildManagedDirectoryProfileCreateStatement|buildOrganizationCreateStatement|INSERT\s*INTO\s*directory_profiles|INSERT\s*INTO\s*help_organizations/,
  );
  assert.match(withdraw, /toStatus:"WITHDRAWN"/);
  assert.match(withdraw, /row\s*\.accountId!==input\s*\.accountId/);
  assert.match(withdraw, /NEW_PROFILE_WITHDRAWN/);
  assert.doesNotMatch(
    withdraw,
    /INSERT\s*INTO\s*directory_profiles|INSERT\s*INTO\s*help_organizations|partner_memberships/,
  );
});

test("Attention new-profile source is safe, stable, deep-linked and exact-counted", () => {
  assert.match(attention, /PARTNER_NEW_PROFILE_REVIEW/);
  assert.match(
    attention,
    /partnerAttentionKey\(\s*"PARTNER_NEW_PROFILE_REVIEW",\s*row\s*\.id\s*\)/,
  );
  assert.match(
    attention,
    /Nový\s*profil:\s*\$\{\s*row\s*\.displayName\s*\}\s*čaká\s*na\s*kontrolu/,
  );
  assert.match(attention, /priority:row\s*\.duplicateConfidence==="HIGH"\?"HIGH":"MEDIUM"/);
  assert.match(attentionStore, /partner_new_profile_metadata/);
  assert.match(attentionStore, /mapPartnerNewProfileAttention/);
  assert.doesNotMatch(attentionStore, /proposed_patch_json/);
  const exactStart = attentionStore.indexOf("export async function loadExactAdminAttentionSummary");
  const exactEnd = attentionStore.indexOf("export async function loadAdminAttentionPage");
  const exact = attentionStore.slice(exactStart, exactEnd);
  assert.match(attentionStore, /PARTNER_NEW_PROFILE_REVIEW/);
  assert.match(
    attentionStore,
    /s\s*\.status\s*IN\s*\(\s*'SUBMITTED',\s*'PENDING_REVIEW',\s*'QUARANTINED'\s*\)/,
  );
  assert.match(exact, /probeSources/);
  assert.match(partnerAttention, /newProfileRow/);
  assert.match(partnerAttention, /newProfiles/);
});

test("Partner UX exposes new profile, history and claim-existing handoff", () => {
  assert.match(profilesPage, /Pridať\s*nový\s*profil/);
  assert.match(profilesPage, /Spravujete\s*tento\s*profil\?/);
  assert.match(requestsPage, /Moje\s*návrhy\s*nových\s*profilov/);
  assert.match(requestsPage, /PartnerNewProfileWithdrawButton/);
  assert.match(newPage, /Pridať\s*nový\s*profil/);
});

test("notifications and Partner audit cover complete 3B lifecycle", () => {
  for (const type of [
    "NEW_PROFILE_SUBMITTED",
    "NEW_PROFILE_CREATED",
    "NEW_PROFILE_LINKED_EXISTING",
    "NEW_PROFILE_REJECTED",
  ])
    assert.match(email, new RegExp(type));
  for (const action of [
    "NEW_PROFILE_SUBMITTED",
    "NEW_PROFILE_WITHDRAWN",
    "NEW_PROFILE_CREATED",
    "NEW_PROFILE_LINKED_EXISTING",
    "NEW_PROFILE_REJECTED",
  ])
    assert.match(platform, new RegExp(action));
  assert.match(email, /profil\s*bol\s*vytvorený\s*ako\s*koncept/i);
});

test("external directory submission keeps address verification non-blocking and routes unresolved addresses to review", () => {
  assert.match(domain, /verifyExternalDirectoryAddressBestEffort/);
  assert.match(domain, /ADDRESS_NEEDS_REVIEW/);
  assert.match(domain, /addressVerification/);
  assert.match(domain, /patch:\s*PartnerProfilePatch|let\s*patch:\s*PartnerProfilePatch/);
  assert.match(domain, /status:\s*"SUBMITTED"/);
  assert.match(domain, /PARTNER_NEW_PROFILE_REVIEW/);
  assert.match(
    newForm,
    /Adresu\s*sa\s*nepodarilo\s*jednoznačne\s*overiť\s*\.\s*Profil\s*môžete\s*odoslať;\s*adresu\s*skontroluje\s*redakcia\s*\./,
  );
  assert.doesNotMatch(domain, /EXACT_PUBLIC/);
});

test("GEO, legacy and commercial invariants stay intact while Partner media remains moderated", () => {
  const combined = [domain, admin, partnerApi, scanApi, withdrawApi, adminApi].join("\n");
  assert.doesNotMatch(combined, /MANAGED_EVENT|PARTNER_EVENT_REVIEW/);
  assert.match(domain, /media_asset_id/);
  assert.match(admin, /publishPartnerSubmissionMedia/);
  assert.doesNotMatch(combined, /\/api\/admin\/uploads|x-upload-folder|R2Bucket/i);
  assert.doesNotMatch(combined, /organization_fundraising_methods|bank_account|donation|checkout/i);
  assert.doesNotMatch(
    combined,
    /premium_entitlement|sponsored_entitlement|stripe|billing|payments|subscriptions/i,
  );
  assert.doesNotMatch(combined, /latitude|longitude|lat\b|lng\b|geocoder/i);
  assert.match(legacyDirectory, /createDirectoryProfileChangeRequest/);
  assert.match(legacyDirectory, /archived_at/);
});

test("Partner new-profile schema does not expose system publication/media fields", () => {
  assert.doesNotMatch(domain, /partnerNewProfile.*slug/i);
  const submit = domain.slice(
    domain.indexOf("export async function submitPartnerNewProfile"),
    domain.indexOf("function statusLabel"),
  );
  assert.doesNotMatch(
    submit,
    /published_at|archived_at|featured|image_url|image_key|seo_json|search_text/i,
  );
  assert.doesNotMatch(submit, /(?:^|[,{]\s*)verified\s*:/im);
});
