import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("admin action containers share one accessible button system", () => {
  const css = read("app/globals.css");

  assert.match(css, /ADMIN-BUTTONS-1: unified admin action controls/);
  assert.match(css, /\.admin-form-actions,/);
  assert.match(css, /\.admin-actions,/);
  assert.match(css, /\.admin-heading-actions/);
  assert.match(css, /\.admin-form-grid > button\[type="submit"\]/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /button\.is-primary/);
  assert.match(css, /button\.is-danger/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /cursor:\s*not-allowed/);
});

test("automation source actions expose clear primary and destructive hierarchy", () => {
  const detail = read("components/admin-automation-source-detail.tsx");
  const manager = read("components/admin-automation-source-manager.tsx");
  const finding = read("components/admin-automation-finding-review.tsx");

  assert.match(detail, /className="is-primary" type="submit"[^>]*>Uložiť konfiguráciu/);
  assert.match(detail, /className="is-primary" type="button"[\s\S]{0,500}?runNow/);
  assert.match(detail, /className="is-danger" type="button"[\s\S]{0,500}?action: "reject"/);
  assert.match(detail, /className="is-danger" type="button"[\s\S]{0,500}?action: "disable"/);
  assert.match(manager, /className="is-primary" type="submit"[^>]*>Vytvoriť vypnutý zdroj/);
  assert.match(manager, /className="is-danger" type="button"[\s\S]{0,500}?candidateAction\(candidate\.id, "reject"\)/);
  assert.match(finding, /className="is-danger" type="button"[\s\S]{0,500}?review\("reject"\)/);
});

test("generic monetization and outreach actions use the same semantic variants", () => {
  const monetization = read("components/admin-monetization-dashboard.tsx");
  const outreach = read("components/admin-outreach-campaign.tsx");

  assert.match(monetization, /className="is-primary" type="submit">Vytvoriť draft kampane/);
  assert.match(monetization, /className="is-danger" type="button"[\s\S]{0,500}?Archivovať/);
  assert.doesNotMatch(outreach, /button button--primary/);
  assert.match(outreach, /className="is-primary" type="button"[\s\S]{0,700}?send/);
  assert.match(outreach, /className="is-danger" type="button"[\s\S]{0,500}?patchCampaign\("cancel"\)/);
});


test("admin PWA settings use the shared semantic action hierarchy", () => {
  const settings = read("components/admin-pwa-settings.tsx");

  assert.match(settings, /className="admin-form-actions"/);
  assert.match(settings, /className="is-primary" type="button" onClick=\{enableNotifications\}/);
  assert.match(settings, /className="is-danger" type="button" onClick=\{disableNotifications\}/);
  assert.match(settings, /<button type="button" onClick=\{\(\) => void inspect\(\)\}/);
});
