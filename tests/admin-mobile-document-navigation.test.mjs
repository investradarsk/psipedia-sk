import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("mobile admin navigation reloads only the two unstable streamed routes", () => {
  const guard = read("components/admin-mobile-document-navigation.tsx");
  const layout = read("app/admin/layout.tsx");
  const navigation = read("components/admin-navigation.tsx");
  assert.match(guard, /window\.matchMedia\("\(max-width: 820px\)"\)\.matches/);
  assert.match(guard, /target\.origin !== window\.location\.origin/);
  assert.match(guard, /target\.pathname !== "\/admin" && target\.pathname !== "\/admin\/clanky"/);
  assert.match(guard, /event\.defaultPrevented \|\| event\.button !== 0/);
  assert.match(guard, /event\.metaKey \|\| event\.ctrlKey \|\| event\.shiftKey \|\| event\.altKey/);
  assert.match(guard, /anchor\.hasAttribute\("download"\)/);
  assert.match(guard, /event\.preventDefault\(\)/);
  assert.match(guard, /window\.location\.assign\(target\.href\)/);
  assert.match(guard, /document\.addEventListener\("click", handler, true\)/);
  assert.match(guard, /document\.removeEventListener\("click", handler, true\)/);
  assert.match(layout, /<AdminMobileDocumentNavigation \/>/);
  assert.match(navigation, /href === "\/admin" \|\| href === "\/admin\/clanky"/);
  assert.match(navigation, /router\.prefetch\(href\)/, "unaffected routes continue using existing navigation");
});

test("admin route failure renders retry and safe full-document escape links instead of white screen", () => {
  const boundary = read("app/admin/error.tsx");
  assert.match(boundary, /"use client"/);
  assert.match(boundary, /Administrácia sa nenačítala/);
  assert.match(boundary, /window\.location\.reload\(\)/);
  assert.match(boundary, /onClick=\{reset\}/);
  assert.match(boundary, /<Link href="\/admin" prefetch=\{false\}>Pracovný prehľad<\/Link>/);
  assert.match(boundary, /<Link href="\/admin\/clanky" prefetch=\{false\}>Články<\/Link>/);
  assert.doesNotMatch(boundary, /error\.message/);
});
