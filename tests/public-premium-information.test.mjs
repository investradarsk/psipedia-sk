import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const css = read("app/info-premium.module.css");

test("all nine V2-13 routes use local premium presentation without replacing the shared hero", () => {
  for (const route of ["o-nas","podmienky-pouzivania","pravne-informacie","sukromie","cookies","zasady-obsahu","opravy-a-podnety","novinky/poslat-tip"]) {
    const page = read("app/" + route + "/page.tsx");
    assert.ok(page.includes('import infoStyles from "@/app/info-premium.module.css"'), route);
    assert.ok(page.includes(route === "novinky/poslat-tip" ? "infoStyles.tip" : "infoStyles.document"), route);
    assert.match(page, /<UniversalPageHero/);
    assert.match(page, /buildPageMetadata/);
    assert.match(page, /id="obsah"/);
  }
  const contact = read("app/kontakt/page.tsx");
  assert.match(contact, /<UniversalPageHero/);
  assert.match(contact, /data-contact-routes/);
  const contactCss = read("app/kontakt/contact.module.css");
  assert.ok(contactCss.includes("var(--ps-radius-card)"));
  assert.ok(contactCss.includes("var(--ps-radius-control)"));
  assert.ok(contactCss.includes("var(--ps-ds5-card-hover-transform)"));
  assert.doesNotMatch(contactCss, /font-family: (Georgia|"Avenir Next")/);
});

test("document and tip styling consume the shared V2 tokens and retain accessible states", () => {
  for (const token of ["--ps-font-heading", "--ps-font-body", "--ps-radius-card", "--ps-radius-control", "--ps-radius-media", "--ps-reading-size", "--ps-reading-leading", "--ps-motion-fast", "--ps-premium-accent-width"]) {
    assert.ok(css.includes("var(" + token), token);
  }
  assert.match(css, /:focus-visible/);
  assert.match(css, /forced-colors: active/);
  assert.match(css, /aria-invalid="true"/);
  assert.match(css, /min-height: 44px/);
  assert.doesNotMatch(css, /:global\(:root\)|font-family: (Georgia|"Avenir Next")/);
});

test("cookie controls, tip form and legal metadata remain linked to their original processes", () => {
  assert.match(read("app/cookies/page.tsx"), /<PrivacyControls\s*\/>/);
  assert.match(read("app/cookies/page.tsx"), /<GoogleMapsConsentControls\s*\/>/);
  assert.match(read("app/pravne-informacie/page.tsx"), /await getLegalSettings\(\)/);
  assert.match(read("app/sukromie/page.tsx"), /await getLegalSettings\(\)/);
  assert.match(read("app/novinky/poslat-tip/page.tsx"), /<NewsTipForm\s*\/>/);
  assert.match(read("components/news-tip-form.tsx"), /fetch\("\/api\/news-tips"/);
});
