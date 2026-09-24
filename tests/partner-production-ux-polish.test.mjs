import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const read = (path) => fs.readFile(new URL("../" + path, import.meta.url), "utf8");

const [layout, header, partnerCss, newEventPage, editEventPage, worker] = await Promise.all([
  "app/layout.tsx",
  "components/site-header.tsx",
  "app/partner/partner.css",
  "app/partner/podujatia/nove/page.tsx",
  "app/partner/podujatia/[resourceId]/upravit/page.tsx",
  "worker/index.ts",
].map(read));

test("public header derives Partner auth state on the server", () => {
  assert.match(layout, /export const dynamic = "force-dynamic"/);
  assert.match(layout, /await cookies\(\)/);
  assert.match(layout, /PARTNER_SESSION_COOKIE/);
  assert.match(layout, /partnerToken \? await getPartnerSession/);
  assert.match(layout, /partnerAuthenticated=\{Boolean\(partnerSession\)\}/);

  assert.match(header, /partnerAuthenticated: boolean/);
  assert.match(header, /partnerAuthenticated \? "\/partner" : "\/partner\/prihlasenie"/);
  assert.match(header, /partnerAuthenticated \? "Partner účet" : "Prihlásiť sa"/);
  assert.match(header, /href=\{partnerHref\}/);
  assert.match(header, />\{partnerLabel\}<\/Link>/);
});

test("Partner-specific header state cannot enter the shared public HTML cache", () => {
  assert.match(
    worker,
    /request\.headers\.has\("authorization"\) \|\| request\.headers\.has\("cookie"\) \|\| request\.headers\.has\("cf-access-jwt-assertion"\)/,
  );
  assert.match(layout, /export const dynamic = "force-dynamic"/);
});

test("Partner shell uses the measured sticky header height as shared scroll offset", () => {
  assert.match(header, /--psipedia-sticky-header-height/);
  assert.match(header, /new ResizeObserver\(update\)/);
  assert.match(header, /header\.getBoundingClientRect\(\)\.height/);
  assert.match(
    partnerCss,
    /scroll-margin-top: calc\(var\(--psipedia-sticky-header-height, 0px\) \+ 16px\)/,
  );
});

test("Partner event copy is external-facing and contains no internal canonical/admin jargon", () => {
  assert.match(
    newEventPage,
    /Po schválení administrátorom sa podujatie uloží ako koncept\. Obrázok, SEO údaje a zverejnenie následne doplní redakcia Psipedie\./,
  );
  assert.doesNotMatch(newEventPage, /canonical|admin flow/i);
  assert.doesNotMatch(editEventPage, /canonical|admin flow|\bslug\b/i);
  assert.match(editEventPage, /Webová adresa a stav zverejnenia/);
});
