import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { directoryEditedFieldMismatches } from "../lib/directory-editor-field-verification.ts";

const profile = (overrides = {}) => ({
  id: 618, category: "chovatelske-kluby", name: "Klub", excerpt: "Text test2",
  description: "Popis uložený", region: "Bratislavský kraj", city: "Bratislava",
  publicPhone: "", websiteUrl: "https://example.org", importData: {
    Telefón: "+421 900 100 200", Facebook: "https://facebook.com/example",
  }, seo: { title: "SEO title", description: "SEO popis", noindex: false },
  ...overrides,
});

test("Directory field verification reads the committed D1 values, not optimistic state", () => {
  const changed = directoryEditedFieldMismatches({
    submitted: { name: "Klub", excerpt: "Text test2", description: "Popis uložený" },
    persisted: profile(),
    editedPaths: ["name", "excerpt", "description"],
  });
  assert.deepEqual(changed, []);
  const missed = directoryEditedFieldMismatches({
    submitted: { excerpt: "Text test2" },
    persisted: profile({ excerpt: "Text test" }),
    editedPaths: ["excerpt"],
  });
  assert.deepEqual(missed, ["excerpt"]);
});

test("Salon contact, SEO and content changes must persist independently", () => {
  const salon = profile({ category: "salony-a-sluzby", excerpt: "Starý Perex",
    importData: { Telefón: "+421 900 100 200", Facebook: "https://facebook.com/example" } });
  const submitted = {
    excerpt: "Nový perex salónu", publicPhone: "+421 900 100 999",
    facebookUrl: "https://facebook.com/example", seo: {
      title: "Nový SEO title", description: "SEO popis", noindex: false,
    },
  };
  assert.deepEqual(directoryEditedFieldMismatches({
    submitted, persisted: salon,
    editedPaths: ["excerpt", "publicPhone", "facebookUrl", "seo.title"],
  }), ["excerpt", "publicPhone", "seo.title"]);
  const persisted = profile({
    category: "salony-a-sluzby", excerpt: submitted.excerpt,
    importData: { Telefón: submitted.publicPhone, Facebook: submitted.facebookUrl },
    seo: submitted.seo,
  });
  assert.deepEqual(directoryEditedFieldMismatches({
    submitted, persisted,
    editedPaths: ["excerpt", "publicPhone", "facebookUrl", "seo.title"],
  }), []);
});

test("explicit clear, multi-line qualification and field-scoped checks", () => {
  const p = profile({ importData: { Telefón: "123" }, qualifications: ["Prax", "Školenia"] });
  assert.deepEqual(directoryEditedFieldMismatches({
    submitted: { publicPhone: "", qualifications: ["Prax", "Školenia"] },
    persisted: p, editedPaths: ["publicPhone", "qualifications"],
  }), ["publicPhone"]);
  assert.deepEqual(directoryEditedFieldMismatches({
    submitted: { description: "Iný text" }, persisted: p, editedPaths: ["excerpt"],
  }), []);
  assert.deepEqual(directoryEditedFieldMismatches({
    submitted: { seo: { noindex: true } },
    persisted: p, editedPaths: ["seo.noindex"],
  }), ["seo.noindex"]);
});

test("all ten categories are guarded by the same confirmed-save contract", () => {
  const categories = [
    "veterinari", "treneri", "kynologicke-kluby", "chovatelske-kluby",
    "chovatelske-stanice", "salony-a-sluzby", "hotely-a-opatrovanie",
    "vencenie", "fyzioterapia", "dalsie-sluzby",
  ];
  for (const category of categories) {
    assert.deepEqual(directoryEditedFieldMismatches({
      submitted: { excerpt: "Zmenený text" },
      persisted: profile({ category, excerpt: "Starý text" }),
      editedPaths: ["excerpt"],
    }), ["excerpt"], category);
  }
  const api = readFileSync("app/api/admin/directory/[id]/route.ts", "utf8");
  assert.match(api, /directoryEditedFieldMismatches\(\{/);
  assert.match(api, /DIRECTORY_FIELDS_D1_SAVE_NOT_CONFIRMED/);
  assert.match(api, /status: 409, headers: \{ "cache-control": "no-store" \}/);
});
