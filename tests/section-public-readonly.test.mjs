import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Run: node --experimental-strip-types --experimental-loader ./tests/cloudflare-loader.mjs --test tests/section-public-readonly.test.mjs
const env = (globalThis.__CLOUDFLARE_WORKERS_ENV__ ??= {});
const { portalSections } = await import("../lib/portal.ts");
const {
  listManagedPortalSections,
  listManagedPortalSectionsForSitemap,
  getManagedPortalSection,
  getManagedPortalSubpage,
  saveManagedPortalSections,
} = await import("../lib/section-store.ts");

function storedSection(slug, overrides = {}) {
  const base = portalSections.find((section) => section.slug === slug);
  assert.ok(base, "Expected canonical portal section: " + slug);
  return {
    slug, label: base.label, eyebrow: base.eyebrow, description: base.description,
    intro: base.intro, hero_config_json: "{}", subpages_json: JSON.stringify(base.subpages),
    position: 4, visible: 1, updated_at: "2026-10-12T12:00:00.000Z",
    ...overrides,
  };
}
function publicDb(rows) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      calls.push(sql);
      assert.match(sql.trim(), /^SELECT\b/i, "A public route must never issue a D1 write");
      return { all: async () => ({ results: rows }) };
    },
    async batch() { throw new Error("Public GET must never batch D1 statements"); },
  };
}
function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("homepage, section/topic and sitemap reads never call CREATE/INSERT/UPDATE/DELETE or batch", async () => {
  const rows = [
    storedSection("steniatka", { position: 3, visible: 1 }),
    storedSection("aktivity", { position: 7, visible: 0 }),
  ];
  const db = publicDb(rows);
  env.DB = db;
  const home = await listManagedPortalSections();
  const sitemap = await listManagedPortalSectionsForSitemap();
  const section = await getManagedPortalSection("steniatka");
  const topic = await getManagedPortalSubpage("steniatka", "prve-dni");
  const articleCounts = await (await import("../lib/section-store.ts")).getManagedPortalSectionArticleCounts();
  assert.equal(home.length, 2);
  assert.deepEqual(home, sitemap, "sitemap and public pages must use identical normalized settings");
  assert.equal(section?.slug, "steniatka");
  assert.equal(topic?.subpage.slug, "prve-dni");
  assert.equal(articleCounts.available, true);
  assert.equal(home[0].position, 3);
  assert.equal(home[1].visible, false);
  assert.equal(home[0].updatedAt, rows[0].updated_at);
  assert.ok(db.calls.length >= 4);
  assert.ok(db.calls.every((sql) => /^\s*SELECT\b/i.test(sql)));
});

test("historical puppy URL-admin-field label is repaired only in rendered data", async () => {
  const raw = JSON.stringify([
    { slug: "prve-dni", label: "Prvé  dni  doma so šteniatkom Adresa URL", description: "Pôvodný popis" },
  ]);
  const db = publicDb([storedSection("steniatka", { subpages_json: raw })]);
  env.DB = db;
  const sections = await listManagedPortalSections();
  const fixed = sections[0].subpages.find((item) => item.slug === "prve-dni");
  assert.equal(fixed.label, portalSections.find((s) => s.slug === "steniatka").subpages.find((s) => s.slug === "prve-dni").label);
  assert.equal(fixed.description, "Pôvodný popis");
  assert.ok(raw.includes("Adresa URL"), "Persisted data remains unchanged");
  assert.equal(db.calls.length, 1);
});

test("duplicate training navigation is hidden without modifying stored JSON", async () => {
  const subpages_json = JSON.stringify([
    { slug: "stary-trening", label: "Tréning psa", description: "Duplicitná položka" },
    { slug: "trening", label: "Tréning", description: "Aktuálny tréning" },
    { slug: "trening", label: "Tréning", description: "Duplicitný slug" },
  ]);
  const db = publicDb([storedSection("aktivity", { subpages_json })]);
  env.DB = db;
  const section = (await listManagedPortalSections())[0];
  assert.equal(section.subpages.filter((item) => item.slug === "trening").length, 1);
  assert.equal(section.subpages.some((item) => item.slug === "stary-trening"), false);
  assert.equal(section.subpages.find((item) => item.slug === "trening")?.description, "Aktuálny tréning");
  assert.equal(db.calls.length, 1);
});

test("corrupt, missing and mixed-invalid JSON safely falls back to canonical public pages", async () => {
  const canonical = portalSections.find((s) => s.slug === "steniatka");
  for (const raw of ["{bad", "null", "", JSON.stringify([null, false, {}, { slug: "prve-dni", label: "Prvé dni" }])]) {
    const db = publicDb([storedSection("steniatka", { subpages_json: raw })]);
    env.DB = db;
    const sections = await listManagedPortalSections();
    assert.equal(sections[0].subpages.length, canonical.subpages.length);
    assert.ok(sections[0].subpages.some((item) => item.slug === "prve-dni"));
    assert.equal(db.calls.length, 1);
  }
});

test("public read implementation is isolated from admin's explicit validation and write path", async () => {
  const source = readSource("../lib/section-store.ts");
  const publicBlock = source.slice(source.indexOf("export const listManagedPortalSections ="), source.indexOf("export const getManagedPortalSubpage ="));
  assert.doesNotMatch(publicBlock, /\b(?:ensure|repairCorruptManagedSubpages)\s*\(|\b(?:UPDATE|INSERT|DELETE|CREATE)\b|\.run\(|\.batch\(/i);
  assert.match(source, /export async function saveManagedPortalSections/);
  assert.match(source, /await ensure\(db\)/);
  assert.match(source, /cleanSubpages\(/);
  assert.match(source, /db\.batch\(statements\)/);
  assert.match(readSource("../app/api/admin/sections/route.ts"), /saveManagedPortalSections/);
});
