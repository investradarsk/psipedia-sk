import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { detailComponentProbeForGroup } from "../lib/visual-library-preview-related-urls.ts";
import {
  componentHtmlSelectors, componentHtmlProbeIdForOwnerGroup,
  validHtmlProbe, classifyHtmlInspection,
} from "../lib/visual-library-html-evidence.ts";

const read = (path) => readFileSync(path, "utf8");
const fake = (selectors = []) => ({
  getElementById: () => null,
  querySelector: (selector) => selectors.includes(selector) ? { selector } : null,
});

test("only audited, literal public DOM markers can prove a component is in server HTML", () => {
  const markerSources = {
    "directory-card": "components/directory-card.tsx",
    "breed-card": "components/breed-card.tsx",
    "event-list": "components/event-card.tsx",
    "help-card": "components/help-card.tsx",
    "help-profile": "components/public-visual-system/public-help-profile-card.tsx",
    "directory-services-short": "components/directory-services-list.tsx",
    "directory-category-navigation": "components/directory-category-navigation.tsx",
    "event-listing-filtered": "components/event-listing-results.tsx",
  };
  for (const [id, path] of Object.entries(markerSources)) {
    const selector = componentHtmlSelectors[id];
    assert.ok(selector && /^\[data-[a-z-]+(?:="[a-z-]+")?\]$/.test(selector));
    const dataAttr = selector.match(/^\[([a-z-]+)/)[1];
    assert.match(read(path), new RegExp(dataAttr + "\\b"));
    assert.equal(componentHtmlProbeIdForOwnerGroup(id), id);
    assert.equal(validHtmlProbe({ kind: "component", componentId: id }), true);
    assert.equal(classifyHtmlInspection(fake([selector]), {kind:"component", componentId:id}).state, "verified");
    assert.equal(classifyHtmlInspection(fake(["h1"]), {kind:"component", componentId:id}).state, "page-only");
    assert.equal(classifyHtmlInspection(fake(), {kind:"component", componentId:id}).state, "missing");
  }
  assert.equal(componentHtmlProbeIdForOwnerGroup("unknown"), null);
  assert.equal(componentHtmlProbeIdForOwnerGroup("__proto__"), null);
  assert.equal(validHtmlProbe({kind:"component",componentId:"h1, body"}), false);
  assert.equal(validHtmlProbe({kind:"component",componentId:"magazine"}), false);
});

test("only confirmed detail-page components receive component-level probes on published profiles", () => {
  assert.equal(detailComponentProbeForGroup("directory-services-short","directory"),"directory-services-short");
  for (const [group,kind] of [
    ["directory-card","directory"],
    ["breed-card","breeds"],
    ["event-list","events"],
    ["help-card","help"],
    ["help-profile","help"],
    ["directory-category-navigation","directory"],
    ["event-listing-filtered","events"],
  ]) assert.equal(detailComponentProbeForGroup(group,kind),null);

  const detail = read("components/directory-profile-detail.tsx");
  const page = read("app/adresar/[category]/[slug]/page.tsx");
  const catalog = read("components/admin-visual-library-visual-catalog.tsx");
  assert.match(detail, /<DirectoryServicesList services=\{presentation\.services\}/);
  assert.match(page, /<DirectoryProfileDetail/);
  assert.match(catalog, /componentId=\{detailComponentProbeForGroup\(chosen\.id, relatedKind\)/);
  assert.match(catalog, /<AdminVisualLibraryHtmlCheck url=\{use\.url\}/);
});

test("component checks are click-only, page-bound, and do not claim hydration or mobile evidence", () => {
  const checker=read("components/admin-visual-library-html-check.tsx");
  const urls=read("components/admin-visual-library-dynamic-urls.tsx");
  const catalog=read("components/admin-visual-library-visual-catalog.tsx");
  assert.match(checker, /componentId \? \{kind:"component",componentId\}/);
  assert.match(checker, /onClick=\{\(\) => void inspect\(\)\}/);
  assert.match(checker, /safePublicHtmlAuditPath\(url\)/);
  assert.match(checker, /method:"GET",credentials:"omit"/);
  assert.match(urls, /request\.kind === initialKind \? componentId : undefined/);
  assert.match(urls, /componentId=\{inspectingComponent\}/);
  assert.match(catalog, /componentHtmlProbeIdForOwnerGroup\(chosen\.id\)/);
  assert.doesNotMatch(checker, /method:"POST"|method:"PUT"|DB\.prepare|localStorage/);
});
