import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const css = read("app/partner/partner.css");
const chat = read("components/partner-private-chat.module.css");
function pages(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? pages(join(dir, entry.name)) : entry.name === "page.tsx" ? [join(dir, entry.name)] : []); }
test("Partner routes use the shared Partner presentation or redirect to it", () => {
  const routes = pages(new URL("../app/partner", import.meta.url).pathname);
  assert.ok(routes.length >= 27);
  for (const route of routes) assert.match(readFileSync(route, "utf8"), /PartnerShell|partner-shell|redirect\(/, route);
  assert.match(read("app/partner/layout.tsx"), /import "\.\/partner\.css"/);
});
test("Partner surfaces consume the Premium V2 canonical tokens", () => {
  for (const token of ["ps-font-heading","ps-font-body","ps-premium-gradient","ps-premium-on-dark","ps-premium-accent","ps-radius-banner-large","ps-radius-card","ps-radius-media","ps-radius-control","coral-dark","cream","paper"]) assert.ok(css.includes("var(--" + token + ")"), token);
  assert.doesNotMatch(css, /Georgia,\s*serif|#174b38|#b74e32/i);
  assert.match(css, /\.partner-auth-copy\s*\{[^}]*background: var\(--ps-premium-gradient\)/s);
  assert.match(css, /\.partner-shell--workspace \.partner-dashboard-welcome\s*\{[^}]*background: var\(--ps-premium-gradient\)/s);
  assert.match(css, /partner-form-message\.is-error\s*\{[^}]*#8b3126/s);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /forced-colors: active/);
  assert.match(css, /\.partner-shell--workspace \.partner-dashboard-header\s*\{[^}]*position: sticky/s);
});
test("Partner chat mode alone consumes V2 tokens; gallery images use the shared media radius", () => {
  assert.match(read("components/partner-private-chat.tsx"), /mode==="PARTNER"\?\x60\$\{styles.chat\} \$\{styles.partnerChat\}/);
  assert.match(chat, /\.partnerChat\{font-family:var\(--ps-font-body\)\}/);
  assert.match(chat, /\.partnerChat \.composer textarea\{[^}]*border-radius:var\(--ps-radius-control\)/);
  assert.match(chat, /\.timeline\{[^}]*max-height:540px/);
  assert.match(read("components/partner-gallery-field.tsx"), /borderRadius: "var\(--ps-radius-media\)"/);
});
