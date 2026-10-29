import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("one identical profile card component serves Help root and every category", () => {
  const card = read("components/public-visual-system/public-help-profile-card.tsx");
  assert.match(card, /data-help-profile-card/);
  assert.match(card, /data-help-profile-media/);
  assert.match(card, /data-help-profile-copy/);
  for (const file of [
    "components/help-overview.tsx",
    "components/help-card.tsx",
    "components/adoption-catalog.tsx",
    "components/lost-found-dogs-page.tsx",
    "components/organization-profile-detail.tsx",
    "app/organizacie/page.tsx",
  ]) {
    assert.match(read(file), /<PublicHelpProfileCard\b/, file);
  }
  const css = read("components/public-visual-system/public-help-profile-card.module.css");
  assert.match(css, /grid-template-columns: 112px minmax\(0, 1fr\)/);
  assert.match(css, /@media \(max-width: 360px\)/);
  assert.match(css, /object-fit: cover/);
});

test("one detail content grid is used for adoption, Help and lost/found", () => {
  const detail = read("components/public-visual-system/public-help-profile-detail-layout.tsx");
  assert.match(detail, /data-public-help-detail-layout/);
  assert.match(detail, /aria-label=\{asideLabel\}/);
  assert.match(detail, /<aside className=\{styles\.aside\}/);
  assert.match(
    read("components/help-details/help-detail-shell.tsx"),
    /<PublicHelpProfileDetailLayout aside=\{sidebar\} asideLabel="Praktické informácie"/,
  );
  for (const file of [
    "components/adoption-detail.tsx",
    "components/help-details/help-detail-shell.tsx",
    "components/lost-found-dog-detail.tsx",
  ]) {
    const code = read(file);
    assert.match(code, /<PublicHelpProfileDetailLayout\b/, file);
    assert.match(code, /<DetailHero\b/, file);
  }
});

test("specific statuses, critical contact details, filters and safety stay intact", () => {
  const adoption = read("components/adoption-catalog.tsx");
  const adoptDetail = read("components/adoption-detail.tsx");
  const help = read("components/help-card.tsx");
  const helpDetail = read("components/help-details/help-detail-shell.tsx");
  const lost = read("components/lost-found-dogs-page.tsx");
  const lostDetail = read("components/lost-found-dog-detail.tsx");
  assert.match(adoption, /dog.status === "RESERVED"/);
  assert.match(adoptDetail, /Profil potrebuje potvrdiť aktuálnosť/);
  assert.match(adoptDetail, /Naposledy potvrdená dostupnosť/);
  assert.match(help, /item.raisedAmount !== null/);
  assert.match(help, /role="progressbar"/);
  assert.match(helpDetail, /Pomáhajte bezpečne/);
  assert.match(lost, /dogReportTypeLabel\(type\)/);
  assert.match(lostDetail, /Telefón a e-mail oznamovateľa nie sú automaticky publikované/);
  assert.match(adoption, /<PublicFilterDisclosure/);
  assert.match(lost, /<PublicFilterDisclosure/);
});

test("broken media uses same fallback system throughout Help profile cards and details", () => {
  for (const file of [
    "components/help-overview.tsx",
    "components/help-card.tsx",
    "components/lost-found-dogs-page.tsx",
    "components/adoption-card-media.tsx",
    "components/help-details/help-detail-shell.tsx",
    "components/adoption-detail.tsx",
    "components/lost-found-dog-detail.tsx",
  ]) {
    const source = read(file);
    assert.match(source, /PublicMediaFallback/);
  }
});


test("S-27 organizations reuse the Help list card and automatic photo display without local card geometry", () => {
  const organizations = read("app/organizacie/page.tsx");
  const styles = read("app/organizacie/organization-hub.module.css");
  assert.match(organizations, /<PublicHelpProfileCard/);
  assert.match(organizations, /data-organization-hub-card/);
  assert.match(organizations, /config=\{organization\.thumbnailImageDisplay\}/);
  assert.match(organizations, /fallbackOnError/);
  assert.doesNotMatch(organizations, /mode: "crop"/);
  assert.doesNotMatch(styles, /\.card\s*\{|\.media\s*\{|\.cardBody\s*\{/);
  assert.match(styles, /grid-template-columns: 1fr/);
});
