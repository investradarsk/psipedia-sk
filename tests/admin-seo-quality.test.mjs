import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { auditSeoQualityEntity } from "../lib/admin-seo-quality-rules.ts";

function entity(overrides = {}) {
  return {
    agenda: "directory",
    id: 1,
    title: "Veterinárna klinika Nitra",
    slug: "veterinarna-klinika-nitra",
    adminHref: "/admin/adresar/1",
    expectedCanonicalPath: "/adresar/veterinari/veterinarna-klinika-nitra",
    parentPath: "/adresar/veterinari",
    excerpt: "Veterinárna klinika v Nitre s ambulantnou a preventívnou starostlivosťou.",
    description: "Veterinárna klinika v Nitre poskytuje preventívnu, diagnostickú a ambulantnú starostlivosť pre psy aj ďalšie spoločenské zvieratá.",
    uniqueContentParts: [
      "Veterinárna klinika v Nitre poskytuje preventívnu, diagnostickú a ambulantnú starostlivosť pre psy aj ďalšie spoločenské zvieratá.",
      "Objednávanie, očkovanie, diagnostika, chirurgia a praktické informácie pre majiteľov zvierat na jednom mieste.",
    ],
    imageUrl: "/media/directory/klinika.webp",
    imageAlt: "Veterinárna klinika Nitra",
    imageIsDecorative: false,
    city: "Nitra",
    cityRequired: true,
    category: "veterinari",
    categoryRequired: true,
    customSeoSupported: true,
    customSeoTitle: "",
    customSeoDescription: "",
    customCanonical: "",
    noindex: false,
    resultTitle: "Veterinárna klinika Nitra – kontakt a služby",
    resultDescription: "Veterinárna klinika Nitra v lokalite Nitra: kontakt, veterinárne služby, adresa a ďalšie praktické informácie.",
    ...overrides,
  };
}

test("ADMIN-SEO-QUALITY-1 distinguishes missing custom SEO from weak resolved metadata", () => {
  const findings = auditSeoQualityEntity(entity());
  assert.ok(findings.some((item) => item.code === "custom-title-missing" && item.scope === "custom"));
  assert.ok(findings.some((item) => item.code === "custom-description-missing" && item.scope === "custom"));
  assert.equal(findings.some((item) => item.code === "result-title-weak"), false);
  assert.equal(findings.some((item) => item.code === "result-description-weak"), false);
});

test("ADMIN-SEO-QUALITY-1 does not treat decorative alt empty as an error", () => {
  const decorative = auditSeoQualityEntity(entity({ imageAlt: "", imageIsDecorative: true }));
  const contentImage = auditSeoQualityEntity(entity({ imageAlt: "", imageIsDecorative: false }));
  assert.equal(decorative.some((item) => item.code === "image-alt-missing"), false);
  assert.equal(contentImage.some((item) => item.code === "image-alt-missing"), true);
});

test("ADMIN-SEO-QUALITY-1 reports explicit noindex and only non-self custom canonicals", () => {
  const selfCanonical = auditSeoQualityEntity(entity({
    noindex: true,
    customCanonical: "https://psipedia.sk/adresar/veterinari/veterinarna-klinika-nitra?utm_source=test#profil",
  }));
  assert.equal(selfCanonical.some((item) => item.code === "noindex-explicit"), true);
  assert.equal(selfCanonical.some((item) => item.code === "canonical-nonstandard"), false);

  const crossCanonical = auditSeoQualityEntity(entity({
    customCanonical: "https://psipedia.sk/adresar/veterinari/iny-profil",
  }));
  assert.equal(crossCanonical.some((item) => item.code === "canonical-nonstandard"), true);
});

test("ADMIN-SEO-QUALITY-1 stays read-only and exposes management links", () => {
  const entities = fs.readFileSync(new URL("../lib/admin-seo-quality-entities.ts", import.meta.url), "utf8");
  const store = fs.readFileSync(new URL("../lib/admin-seo-quality-store.ts", import.meta.url), "utf8");
  const page = fs.readFileSync(new URL("../app/admin/kvalita/seo/page.tsx", import.meta.url), "utf8");

  assert.match(entities, /SELECT id, slug, name, category/);
  assert.match(entities, /WHERE status = 'published'/);
  assert.doesNotMatch(entities, /\b(?:INSERT|UPDATE|DELETE|REPLACE)\b/i);
  assert.doesNotMatch(store, /\b(?:INSERT|UPDATE|DELETE|REPLACE)\b/i);
  assert.match(page, /item\.entity\.adminHref/);
  assert.match(page, /Spravovať →/);
  assert.doesNotMatch(page, /fetch\(|method=["']POST|method=["']PUT|method=["']DELETE/);
});

test("ADMIN-SEO-QUALITY-1 covers every requested canonical agenda", () => {
  const entities = fs.readFileSync(new URL("../lib/admin-seo-quality-entities.ts", import.meta.url), "utf8");
  for (const marker of [
    'agenda: "directory"',
    'agenda: "events"',
    'agenda: "help"',
    'agenda: "organizations"',
    'agenda: "adoptions"',
    'agenda: "breeds"',
    'agenda: "articles"',
  ]) assert.ok(entities.includes(marker), marker);
});
