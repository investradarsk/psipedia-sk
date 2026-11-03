import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MAX_VISUAL_AUDIT_HTML_BYTES,
  safePublicHtmlAuditPath, validHtmlProbe,
  classifyHtmlInspection, profileHtmlSelectors,
} from "../lib/visual-library-html-evidence.ts";

const read = (path) => readFileSync(path,"utf8");

test("HTML audit accepts only exact public Psipedia URLs without query or private routes", () => {
  assert.equal(safePublicHtmlAuditPath("https://psipedia.sk/"),"/");
  assert.equal(safePublicHtmlAuditPath("https://psipedia.sk/plemena/labradorsky-retriever"),"/plemena/labradorsky-retriever");
  assert.equal(safePublicHtmlAuditPath("https://psipedia.sk/adresar/veterinari/ukazka"),"/adresar/veterinari/ukazka");
  for(const url of [
    "http://psipedia.sk/","https://psipedia.sk.evil.test/",
    "https://evil.test/","https://psipedia.sk@evil.test/",
    "https://psipedia.sk/admin","https://psipedia.sk/admin/komponenty",
    "https://psipedia.sk/api/admin/visual-library/urls",
    "https://psipedia.sk/partner/profily",
    "https://psipedia.sk/plemena/[slug]","https://psipedia.sk/plemena/%2fadmin",
    "https://psipedia.sk/?q=test","https://psipedia.sk/#anchor",
    "https://psipedia.sk//other.example","/plemena/labradorsky-retriever",
    "javascript:alert(1)",null,"https://psipedia.sk/"+ "x".repeat(520),
  ])assert.equal(safePublicHtmlAuditPath(url),null, String(url));
  assert.ok(MAX_VISUAL_AUDIT_HTML_BYTES <= 1_500_000);
});

test("only explicit markup markers count as verified, not page headings or React imports", () => {
  const fake = (ids=[],selectors=[])=>({
    getElementById: (id)=>ids.includes(id) ? {id} : null,
    querySelector: (selector)=>selectors.includes(selector) ? {selector} : null,
  });
  assert.equal(classifyHtmlInspection(fake(["psipedia-banner-home-profile"]),
    {kind:"anchor",anchorId:"psipedia-banner-home-profile"}).state,"verified");
  assert.equal(classifyHtmlInspection(fake([],["h1"]),
    {kind:"anchor",anchorId:"psipedia-banner-home-profile"}).state,"missing");
  assert.equal(classifyHtmlInspection(fake([],['[data-testid="breed-hero"]']),
    {kind:"profile",profileKind:"breeds"}).state,"verified");
  assert.equal(classifyHtmlInspection(fake([],["h1"]),
    {kind:"profile",profileKind:"directory"}).state,"page-only");
  assert.equal(classifyHtmlInspection(fake([],["h1"]),
    {kind:"profile",profileKind:"articles"}).state,"page-only");
  assert.equal(classifyHtmlInspection(fake(),
    {kind:"profile",profileKind:"events"}).state,"missing");
  assert.equal(profileHtmlSelectors.adoptions,'main[data-adoption-source="canonical"]');
  assert.ok(validHtmlProbe({kind:"anchor",anchorId:"psipedia-promo-home"}));
  assert.equal(validHtmlProbe({kind:"anchor",anchorId:"foo#bar"}),false);
  assert.equal(validHtmlProbe({kind:"anchor",anchorId:"x".repeat(150)}),false);
  assert.equal(validHtmlProbe({kind:"profile",profileKind:"invalid"}),false);
});

test("manual HTML checks stay client-only, read-only and bounded with no background crawling", () => {
  const component=read("components/admin-visual-library-html-check.tsx");
  const route=read("components/admin-visual-library-route-audit.tsx");
  const dynamic=read("components/admin-visual-library-dynamic-urls.tsx");
  assert.match(component,/onClick=\{\(\) => void inspect\(\)\}/);
  assert.match(component,/safePublicHtmlAuditPath\(url\)/);
  assert.match(component,/method:"GET",credentials:"omit",mode:"same-origin"/);
  assert.match(component,/cache:"no-store",redirect:"error"/);
  assert.match(component,/response\.body\.getReader\(\)/);
  assert.match(component,/size > MAX_VISUAL_AUDIT_HTML_BYTES/);
  assert.match(component,/DOMParser\(\)\.parseFromString\(html,"text\/html"\)/);
  assert.match(component,/data-html-evidence=\{result\.state\}/);
  assert.match(route,/<AdminVisualLibraryHtmlCheck/);
  assert.match(dynamic,/<AdminVisualLibraryHtmlCheck/);
  assert.match(dynamic,/profileKind=\{item\.kind\}/);
  assert.doesNotMatch(component,/method:"POST"|method:"PUT"|localStorage|cloudflare:workers|DB\.prepare/);
  assert.doesNotMatch(route,/method: "POST"|method: "PUT"/);
});
