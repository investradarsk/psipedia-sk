import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("compact finish 02 changes real specialized admin surfaces, not public pages", () => {
  const expected = {
    "components/admin-section-hub.module.css": /min-height: 112px;/,
    "components/admin-missing-quality-dashboard.module.css": /\.total \{font-size:36px;/,
    "components/admin-workspace-activity.module.css": /--admin-v3-compact-gap/,
    "components/admin-operations-ux.module.css": /min-height: 106px;/,
    "components/admin-attention-queue.module.css": /gap: \.55rem;/,
    "components/admin-organization-publication.module.css": /grid-template-columns: 44px 64px/,
    "components/admin-eshop-editor.module.css": /grid-template-columns: 150px minmax\(0,1fr\)/,
    "components/admin-event-dashboard.module.css": /minmax\(0, 5rem\)/,
    "components/admin-breed-dashboard.module.css": /padding: 9px 10px;/,
    "components/admin-photo-gallery.module.css": /minmax\(min\(100%, 9rem\)/,
    "app/admin/partners/partners.css": /\.admin-partner-stats article\{padding:11px 12px;/,
    "app/admin/recenzie-profilov/reviews.css": /\.admin-review-row\{[^\n]*padding:10px 12px;/,
  };
  for (const [path, check] of Object.entries(expected)) {
    assert.match(read(path), check, path);
  }
});

test("touch targets and upload behavior survive compact design", () => {
  assert.match(read("components/admin-missing-quality-dashboard.module.css"), /\.actions button,\.rejectAll \{[^\n]*min-height:44px;/);
  assert.match(read("components/admin-missing-quality-dashboard.module.css"), /\.filters button \{min-height:44px;/);
  assert.match(read("components/admin-workspace-activity.module.css"), /\.secondary,\.active,\.actions button\{min-height:44px;/);
  assert.match(read("components/admin-attention-queue.module.css"), /\.open \{[\s\S]*?min-height: 44px;/);
  assert.match(read("components/admin-attention-queue.module.css"), /\.sourceCounts a \{[\s\S]*?min-height: 44px;/);
  assert.match(read("components/admin-eshop-editor.module.css"), /\.uploadButton \{[^\n]*min-height: 44px;/);
  assert.match(read("components/admin-photo-gallery.module.css"), /\.controls button, \.gallery button \{ min-height: 44px; min-width: 44px; \}/);
  assert.match(read("components/admin-organization-publication.module.css"), /\.actions a \{\s*min-height: 44px;/);
});

test("Mapy preserve canonical actions and use shared scoped layout", () => {
  const map = read("components/admin-geo-operator-dashboard.tsx");
  const styles = read("app/admin/admin-workspace.css");
  assert.match(map, /className="admin-geo-operator-workspace"/);
  assert.match(map, /className="admin-geo-operator-list"/);
  assert.match(map, /<div data-google-bulk-summary>/);
  assert.match(styles, /\[data-admin-workspace\] \.admin-geo-operator-workspace/);
  assert.match(styles, /\[data-admin-workspace\] \.admin-geo-operator-list/);
  assert.match(styles, /--admin-v3-compact-gap/);
  assert.match(map, /<AdminGooglePlacePicker/);
  assert.match(map, /\/api\/admin\/geo\/bulk-google/);
  assert.match(map, /markNotRequired\(item\)/);
  assert.doesNotMatch(map, /<div style=\{\{ display: "grid", gap: 16 \}\}>/);
});

test("compact QA captures genuine routes at 1440/768/390/320 with overflow check", () => {
  const e2e = read("tests/e2e/admin-ia-2.spec.ts");
  assert.match(e2e, /compact finish 02: actual pages across four breakpoints/);
  assert.match(e2e, /\[1440, 768\]/);
  assert.match(e2e, /\[390, 320\]/);
  for (const route of ["/admin", "/admin/kvalita", "/admin/operations", "/admin/pomoc-psom"]) {
    assert.ok(e2e.includes(JSON.stringify(route)), route);
  }
  assert.match(e2e, /document\.documentElement\.scrollWidth/);
  assert.match(e2e, /page\.screenshot\(/);
});

test("compact dashboard and Operations use all available columns without serif headings", () => {
  const dashboard = read("components/admin-workspace-dashboard.module.css");
  const operations = read("components/admin-operations-ux.module.css");
  const activity = read("components/admin-workspace-activity.module.css");
  const quality = read("components/admin-missing-quality-dashboard.module.css");

  // auto-fit avoids an empty fourth KPI column when only three dashboard
  // metrics are rendered. Operations similarly expands two cards across width.
  assert.match(dashboard, /grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 245px\), 1fr\)\)/);
  assert.match(operations, /grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 290px\), 1fr\)\)/);
  assert.match(dashboard, /\.sectionHeading h2, \.panelHeading h2 \{ font-family: inherit; font-weight: 800;/);
  assert.match(activity, /\.titleRow h2\{[^\n]*font-family:inherit;font-weight:800;/);
  assert.match(quality, /\.heading h2 \{font-family:inherit;font-weight:800;/);
  const inbox = read("components/admin-attention-queue.module.css");
  assert.match(inbox, /\.empty h2 \{[\s\S]*?font-family: inherit;[\s\S]*?font-size: 1\.05rem;/);

  // Tablet/mobile overrides and keyboard/touch controls remain present.
  assert.match(dashboard, /@media \(max-width: 1100px\)/);
  assert.match(dashboard, /@media \(max-width: 760px\)/);
  assert.match(operations, /@media \(max-width: 640px\)/);
  assert.match(dashboard, /\.actionRow a, \.quickLinks a \{ min-height: 44px; \}/);
});
