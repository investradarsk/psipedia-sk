import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ownerGroupForBanner,
  ownerKnownUsesForGroup,
  OWNER_EXAMPLE_GROUPS,
} from "../lib/visual-library-owner-evidence.ts";

const articleUsage = (status = "complete") => ({
  status,
  scannedArticles: 1,
  generatedAt: "2026-11-03T07:00:00.000Z",
  day: "2026-11-03",
  byKey: {
    veterinari: [{
      url: "https://psipedia.sk/clanky/starostlivost-o-psa",
      label: "Starostlivosť o psa",
      placement: "Bočný panel článku · automaticky dnes",
      evidence: "published-auto-today",
      anchorId: "promo-autoday",
    }],
  },
});

test("only explicitly verified banner renderers are grouped as one implementation", () => {
  assert.equal(ownerGroupForBanner({ id: "clanky:veterinari" }), "magazine");
  assert.equal(ownerGroupForBanner({ id: "homepage:profil" }), "magazine");
  assert.equal(ownerGroupForBanner({ id: "plemena:kluby" }), "magazine");
  assert.equal(ownerGroupForBanner({ id: "help:lost-found" }), "rescue");
  assert.equal(ownerGroupForBanner({ id: "help:overview:0" }), "rescue");
  assert.equal(ownerGroupForBanner({ id: "help:closing" }), "closing");
  assert.equal(ownerGroupForBanner({ id: "unknown:veterinari" }), null);
});

test("server-side visual hero variants share the same component but not the same URL", () => {
  assert.equal(OWNER_EXAMPLE_GROUPS["hero:plemena"].root, "unified-section-hero");
  assert.equal(OWNER_EXAMPLE_GROUPS["hero:clanky"].root, "unified-section-hero");
  assert.equal(OWNER_EXAMPLE_GROUPS["cta:directory-map"].root, "actions");

  const example = {
    id: "hero:plemena",
    label: "Hero – plemená",
    explanation: "Skutočný hero",
    uses: [{ url: "https://psipedia.sk/plemena", label: "Plemená", placement: "Hlavná hlavička", anchorId: "hero" }],
  };
  const found = ownerKnownUsesForGroup("unified-section-hero", [], [example], articleUsage());
  assert.equal(found.uses.length, 1);
  assert.deepEqual(found.uses[0], {
    url: "https://psipedia.sk/plemena",
    label: "Plemená",
    placement: "Hlavná hlavička",
    anchorId: "hero",
    evidence: "verified-in-code",
  });
  assert.equal(ownerKnownUsesForGroup("actions", [], [example], articleUsage()).uses.length, 0);
});

test("published article results include only actual concrete public URLs and deduplicate exact uses", () => {
  const banners = [
    { id: "clanky:veterinari", label: "Veterinári", title: "Hľadáte veterinára?", ctaHref: "/adresar/veterinari", uses: [] },
    { id: "homepage:profil", label: "Profil", title: "Pridajte svoj profil", ctaHref: "/partner/profily/novy", uses: [
      { url: "https://psipedia.sk/", label: "Homepage", placement: "Promo", evidence: "verified-in-code" },
      { url: "https://psipedia.sk/", label: "Homepage", placement: "Promo", evidence: "verified-in-code" },
    ] },
    { id: "help:closing", label: "Pomoc", title: "Pomoc psom", ctaHref: "/pomoc-psom", uses: [
      { url: "https://psipedia.sk/pomoc-psom", label: "Pomoc", placement: "Koniec", evidence: "verified-in-code" },
    ] },
  ];
  const found = ownerKnownUsesForGroup("magazine", banners, [], articleUsage());
  assert.equal(found.uses.length, 2);
  assert.ok(found.uses.some((use) => use.url === "https://psipedia.sk/"));
  assert.ok(found.uses.some((use) => use.evidence === "published-auto-today"));
  assert.ok(found.matchingLabels.includes("Veterinári"));
  assert.ok(!found.uses.some((use) => use.url.includes("[slug]")));
  assert.equal(ownerKnownUsesForGroup("closing", banners, [], articleUsage()).uses.length, 1);
  assert.equal(ownerKnownUsesForGroup("magazine", banners, [], articleUsage("unavailable")).uses.length, 1);
});

test("visual owner screen shows exact URL evidence, and technical candidates remain separate", async () => {
  const { readFileSync } = await import("node:fs");
  const catalog = readFileSync("components/admin-visual-library-visual-catalog.tsx", "utf8");
  const parent = readFileSync("components/admin-visual-library.tsx", "utf8");
  assert.match(parent, /examples=\{examples\} articleUsage=\{articleUsage\}/);
  assert.match(catalog, /ownerKnownUsesForGroup/);
  assert.match(catalog, /chosen\.knownUses/);
  assert.match(catalog, /Otvoriť miesto/);
  assert.match(catalog, /Doložené v zdrojovom kóde/);
  assert.match(catalog, /nie sú automatickým dôkazom/i.test(catalog) ? /Nie sú automatickým dôkazom/ : /Nie sú automatickým dôkazom/);
  assert.match(catalog, /Ďalšie možné použitia podľa kódu/);
  assert.doesNotMatch(catalog, /method:\s*"(POST|PUT|DELETE)"|DB\.prepare/);
});
