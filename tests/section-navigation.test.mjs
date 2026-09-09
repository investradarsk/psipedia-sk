import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("editorial section tabs use the managed subsection source of truth", () => {
  const tabs = read("components/portal-section-tabs.tsx");
  assert.match(tabs, /section\.subpages\.filter/);
  assert.match(tabs, /subpage\.visible !== false/);
  assert.match(tabs, /portalSubpageHref\(section, subpage\)/);
  assert.match(tabs, /aria-current=\{active \? "page"/);
  assert.doesNotMatch(tabs, /pred-kupou-psa|zdravie|psie-sporty/);
  assert.doesNotMatch(tabs, /Adresa URL|adminFieldLabels/);
  assert.doesNotMatch(tabs, /\?category=|\?kategoria=|URLSearchParams/);
});

test("managed subsection writes reject technical labels and malformed slugs", () => {
  const store = read("lib/section-store.ts");
  assert.match(store, /adminFieldLabels/);
  assert.match(store, /normalizedLabel\.endsWith\(" adresa url"\)/);
  assert.match(store, /Adresa podsekcie musí byť platný slug bez úvodnej alebo koncovej pomlčky/);
  assert.match(store, /repairCorruptManagedSubpages/);
  assert.match(store, /system:data-repair/);
});

test("section editor keeps subsection name and address in separate fields", () => {
  const editor = read("components/admin-section-editor.tsx");
  assert.match(editor, /<label>Názov<input value=\{subpage\.label\}/);
  assert.match(editor, /updateSubpage\(section\.slug, subIndex, \{ label: event\.target\.value \}\)/);
  assert.match(editor, /<label>Adresa<input value=\{subpage\.slug\}/);
  assert.match(editor, /updateSubpage\(section\.slug, subIndex, \{ slug: event\.target\.value/);
});

test("editorial hubs expose direct content before the area directory", () => {
  const hub = read("components/portal-hub.tsx");
  const tabsPosition = hub.indexOf("<PortalSectionTabs section={section}");
  const contentPosition = hub.indexOf("{isEditorialHub && latestContent}");
  const directoryPosition = hub.indexOf("portal-directory");
  assert.ok(tabsPosition >= 0, "hub musí používať spoločné SectionTabs");
  assert.ok(contentPosition > tabsPosition, "obsah musí nasledovať po sekčnej navigácii");
  assert.ok(directoryPosition > contentPosition, "články musia byť dostupné pred rozcestníkom oblastí");
  assert.match(hub, /featuredArticleSlugs/);
});

test("portal hub callouts cannot pull back over section tabs", () => {
  const css = read("app/design-system.css");
  const hub = read("components/portal-hub.tsx");

  assert.match(
    css,
    /\.portal-section-tabs\s*\+\s*\.shell\s*\{[\s\S]*?margin-top:\s*var\(--ps-space-stack\);[\s\S]*?\}/,
    "spoločný layout musí po SectionTabs rezervovať kladnú vertikálnu medzeru",
  );

  const tabsPosition = hub.indexOf("<PortalSectionTabs section={section}");
  for (const className of ["care-urgent", "activity-fit", "puppy-start"]) {
    assert.ok(
      hub.indexOf(className) > tabsPosition,
      `${className} musí nasledovať po spoločnej sekčnej navigácii`,
    );
  }
});

test("structured topic landing pages keep the section system and active tab", () => {
  const topic = read("components/portal-topic.tsx");
  assert.match(topic, /isStructuredTopic && <PortalSectionTabs section=\{section\} activeSlug=\{subpage\.slug\}/);
  assert.match(topic, /subpage\.homeSteps/);
  assert.match(topic, /subpage\.warningSigns/);
  assert.match(topic, /subpage\.expertAdvice/);
  assert.match(topic, /subpage\.serviceLinks/);
  assert.match(topic, /featuredArticleSlugs/);
});

test("section tabs remain compact and horizontally scrollable on small screens", () => {
  const css = read("app/design-system.css");
  assert.match(css, /\.section-tabs-inner[\s\S]*overflow-x: auto/);
  assert.match(css, /scroll-snap-type: x proximity/);
  assert.match(css, /\.section-tab\.is-active/);
  assert.match(css, /\.section-tab\[aria-current="page"\]/);
});
