import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("primary admin navigation is alerts-first and separates maps and technical tools", () => {
  const shell = read("components/admin-shell.tsx");
  const navigation = shell.slice(shell.indexOf("function AdminNavigation"), shell.indexOf("function BellIcon"));
  assert.match(navigation, /href="\/admin\/automatizacie">Automatizácie<\/Link>/);
  assert.match(navigation, /href="\/admin\/operations">Upozornenia<\/Link>/);
  assert.match(navigation, /href="\/admin\/operations\/geo">Mapy<\/Link>/);
  assert.match(navigation, /href="\/admin\/nastroje">Technické nástroje<\/Link>/);
  assert.match(navigation, /href="\/admin\/partners">Partneri<\/Link>/);
  assert.doesNotMatch(navigation, />Operácie<\/Link>/);
  assert.doesNotMatch(navigation, /href="\/admin\/import"/);
  assert.doesNotMatch(navigation, /href="\/admin\/adresar\/navrhy"/);

  const hrefs = [...navigation.matchAll(/<Link href="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(hrefs).size, hrefs.length, "primary navigation must not duplicate entries");
});

test("existing operations route remains the alerts page and preserves exact count behavior", () => {
  const page = read("app/admin/operations/page.tsx");
  const shell = read("components/admin-shell.tsx");
  assert.match(page, /requireAdminPageUser\("\/admin\/operations"\)/);
  assert.match(page, /title="Upozornenia"/);
  assert.match(page, /summarizeAdminAttention\(allItems\)/);
  assert.match(page, /attentionCount=\{summary\.active\}/);
  assert.match(shell, /loadExactAdminAttentionSummary/);
  assert.match(shell, /activeCount > 99 \? "99\+" : activeCount/);
  assert.match(shell, /href="\/admin\/operations"/);
});

test("human-action queues remain in alerts, including real geo review work", () => {
  const attention = read("lib/admin-attention-queue.ts");
  for (const label of [
    "Moderácia",
    "Profilové recenzie",
    "Tipy pre redakciu",
    "Návrhy úprav",
    "Dopyty",
    "Hodnotenia článkov",
    "Adopcie",
    "Automatický research",
    "Partner claims",
    "Partner úpravy profilov",
    "Partner nové profily",
    "Partner podujatia",
    "Partner overenia",
    "Partner komerčné leady",
    "Partner komerčné dohody",
    "Geo lokality",
  ]) {
    assert.match(attention, new RegExp(label));
  }
  assert.match(attention, /GEO_LOCATION_ISSUE: "Geo lokality"/);
});

test("technical utilities are absent from alerts landing and have their own thin landing page", () => {
  const alerts = read("app/admin/operations/page.tsx");
  const tools = read("app/admin/nastroje/page.tsx");
  assert.doesNotMatch(alerts, /Geo foundation|Lokality pre budúcu mapu|Profilový outreach/);
  assert.match(tools, /title="Technické nástroje"/);
  assert.match(tools, /href="\/admin\/import"/);
  assert.match(tools, /href="\/admin\/operations\/outreach"/);
  assert.doesNotMatch(tools, /fetch\(|method=["'](?:post|put|patch|delete)["']/i);
  assert.equal(existsSync(new URL("../app/api/admin/nastroje", import.meta.url)), false);
});

test("maps keep the existing GEO route and advanced tools while exposing geo alerts separately", () => {
  const geo = read("app/admin/operations/geo/page.tsx");
  assert.match(geo, /requireAdminPageUser\("\/admin\/operations\/geo"\)/);
  assert.match(geo, /title="Mapy — profily"/);
  assert.match(geo, /href="\/admin\/operations\?source=GEO_LOCATION_ISSUE"/);
  assert.match(geo, /AdminGeoOperatorDashboard/);
  assert.match(geo, /AdminGeoOperations/);
  assert.match(geo, /Pokročilé nástroje/);
});

test("automation and partner review deep links remain on the existing review systems", () => {
  const concept = read("app/admin/automatizacie/[category]/cluster/[id]/page.tsx");
  const attention = read("lib/admin-attention-queue.ts");
  const partnerAttention = read("lib/partner-attention.ts");
  assert.match(concept, /\/admin\/operations\/automation\//);
  assert.equal(existsSync(new URL("../app/admin/operations/automation/[id]/page.tsx", import.meta.url)), true);
  assert.match(attention, /partnerAttentionHref/);
  assert.match(partnerAttention, /href:"\/admin\/partners\/claims"/);
  assert.match(partnerAttention, /href:"\/admin\/partners\/verifications"/);
  assert.match(partnerAttention, /href:"\/admin\/partners\/commercial"/);
  assert.match(partnerAttention, /href:"\/admin\/partners\/events"/);
});

test("mobile navigation and focused cards keep existing no-overflow contracts", () => {
  const globals = read("app/globals.css");
  const operationsCss = read("components/admin-operations-ux.module.css");
  assert.match(globals, /\.admin-section-nav\s*\{[^}]*overflow-x:\s*auto;/s);
  assert.match(globals, /\.admin-nav-group,\s*\n\s*\.admin-nav-public \{ flex: 0 0 auto; \}/);
  assert.match(operationsCss, /@media \(max-width: 860px\)[\s\S]*\.hubGrid \{\s*grid-template-columns: 1fr;/);
});

test("IA refactor adds no operations backend and no canonical/publication mutation surface", () => {
  const alerts = read("app/admin/operations/page.tsx");
  const tools = read("app/admin/nastroje/page.tsx");
  assert.doesNotMatch(alerts + tools, /fetch\(|method=["'](?:post|put|patch|delete)["']/i);
  assert.equal(existsSync(new URL("../app/api/admin/operations", import.meta.url)), false);
  assert.equal(existsSync(new URL("../app/api/admin/nastroje", import.meta.url)), false);
});
