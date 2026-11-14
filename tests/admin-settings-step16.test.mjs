import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("step 16: app settings and Notion settings keep original functional components", () => {
  const settings = read("app/admin/nastavenia/page.tsx");
  const notion = read("app/admin/nastavenia/notion/page.tsx");
  const pwa = read("components/admin-pwa-settings.tsx");
  assert.match(settings, /data-admin-content-module="application-settings"/);
  assert.match(settings, /className="admin-settings-integration-card"/);
  assert.match(settings, /href="\/admin\/nastavenia\/notion"/);
  assert.match(settings, /<AdminPwaSettings/);
  assert.match(notion, /data-admin-content-module="notion-settings"/);
  assert.match(notion, /<AdminNotionFieldSettings/);
  assert.match(notion, /<AdminNotionManualTransfer/);
  assert.match(pwa, /onClick=\{enableNotifications\}/);
  assert.match(pwa, /onClick=\{disableNotifications\}/);
  assert.match(pwa, /onClick=\{sendTestNotification\}/);
});

test("step 16: component visual library, banner preview and optional registry remain", () => {
  const page = read("app/admin/komponenty/page.tsx");
  const library = read("components/admin-visual-library.tsx");
  const css = read("components/admin-visual-library.module.css");
  assert.match(page, /data-admin-content-module="visual-library"/);
  assert.match(page, /<AdminVisualLibrary/);
  assert.match(page, /className="admin-components-technical-register"/);
  assert.match(page, /<AdminComponentRegistry/);
  assert.match(library, /<AdminVisualLibraryBannerPreview/);
  assert.match(library, /<AdminVisualLibraryEditor/);
  assert.match(library, /<AdminVisualLibraryVisualCatalog/);
  assert.match(css, /ADMIN VISUAL 16\/18/);
  assert.match(css, /overflow-x: auto; overscroll-behavior-inline: contain/);
});

test("step 16: monetization retains exact draft, status and promotion handlers", () => {
  const page = read("app/admin/monetizacia/page.tsx");
  const src = read("components/admin-monetization-dashboard.tsx");
  assert.match(page, /data-admin-content-module="monetization-settings"/);
  assert.match(page, /<AdminMonetizationDashboard/);
  assert.match(src, /method: "PATCH"/);
  assert.match(src, /method: "POST"/);
  assert.match(src, /setStatus\("campaign", campaign\.id, "active"\)/);
  assert.match(src, /setStatus\("promotion", promotion\.id, "paused"\)/);
  assert.match(src, /action=\{createCampaign\}/);
  assert.match(src, /action=\{createPromotion\}/);
  assert.match(src, /name="placements"/);
  assert.match(src, /name="isAffiliate"/);
});

test("step 16: legal readiness and save, external links are preserved", () => {
  const page = read("app/admin/pravne/page.tsx");
  const src = read("components/admin-legal-settings.tsx");
  assert.match(page, /data-admin-content-module="legal-settings"/);
  assert.match(page, /<AdminLegalSettings/);
  assert.match(src, /className="admin-legal" onSubmit=\{save\}/);
  assert.match(src, /method: "PUT"/);
  assert.match(src, /admin-legal-readiness/);
  assert.match(src, /href="https:\/\/rpvs\.gov\.sk\/rpvs"/);
  assert.match(src, /type="submit" disabled=\{saving\}/);
});

test("step 16: navigation preserves drag, keyboard ordering, save and safe removal", () => {
  const page = read("app/admin/navigacia/page.tsx");
  const src = read("components/admin-navigation-editor.tsx");
  assert.match(page, /data-admin-content-module="navigation-settings"/);
  assert.match(page, /<AdminNavigationEditor/);
  assert.match(src, /draggable key=\{item\.id\}/);
  assert.match(src, /moveItem\(item\.id, -1\)/);
  assert.match(src, /moveItem\(item\.id, 1\)/);
  assert.match(src, /<AdminDestructiveConfirmDialog/);
  assert.match(src, /onClick=\{save\}/);
});

test("step 16: visual rules are opt-in to admin only with no global overflow masking", () => {
  const layout = read("app/admin/layout.tsx");
  const css = read("app/admin/admin-settings-step16.css");
  assert.match(layout, /import "\.\/admin-settings-step16\.css";/);
  for (const section of ["application-settings", "notion-settings", "visual-library",
    "navigation-settings", "monetization-settings", "legal-settings"]) {
    assert.ok(css.includes('data-admin-content-module="' + section + '"'), section);
  }
  assert.match(css, /\[data-admin-workspace\]/);
  assert.match(css, /@media \(max-width: 430px\)/);
  assert.match(css, /font-size: 16px/);
  assert.doesNotMatch(css, /overflow-x:\s*hidden/);
  assert.doesNotMatch(css, /(?:^|\n)\s*(?:body|html)\s*\{/);
  for (const file of [
    "components/admin-component-registry.module.css",
    "components/admin-pwa.module.css",
    "components/admin-notion-field-settings.module.css",
  ]) {
    assert.match(read(file), /ADMIN VISUAL 16\/18/, file);
  }
});
