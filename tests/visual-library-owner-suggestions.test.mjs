import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { suggestOwnerVisualPairs } from "../lib/visual-library-owner-suggestions.ts";

const item = (id, title, family, paths, routes = [], knownUses = []) =>
  ({ id, title, family, paths, routes, knownUses });

test("candidate pairs compare separate visual families, not variants of one canonical component", () => {
  const groups = [
    item("magazine", "Fotografický promo banner", "banner", ["components/public-magazine.tsx"], ["/clanky"]),
    item("context", "Informačný banner", "banner", ["components/public-context.tsx"], ["/clanky"]),
    item("section-header", "Hlavička sekcie", "hero", ["components/public-hero.tsx"], ["/clanky"]),
    item("magazine", "Druhý variant toho istého bannera", "banner", ["components/public-magazine.tsx"]),
  ];
  const result = suggestOwnerVisualPairs(groups);
  assert.ok(result.some(x => x.leftId === "magazine" && x.rightId === "context"));
  assert.ok(result.every(x => x.leftId !== x.rightId));
  assert.ok(result.every(x => x.leftId !== "section-header" && x.rightId !== "section-header"));
  assert.match(result[0].reasons.join(" "), /Rovnaká kategória/);
});

test("actual common public page is a stronger review signal than unrelated categories", () => {
  const a = item("a", "Pomoc karta", "card", ["a.tsx"], [], [{url:"https://psipedia.sk/pomoc-psom#foo"}]);
  const b = item("b", "Adopcia karta", "card", ["b.tsx"], [], [{url:"https://psipedia.sk/pomoc-psom#bar"}]);
  const c = item("c", "Iná karta", "card", ["c.tsx"], ["/recenzie"]);
  const d = item("d", "Bannery", "banner", ["d.tsx"]);
  const result = suggestOwnerVisualPairs([a,b,c,d]);
  assert.equal(result[0].leftId, "a");
  assert.equal(result[0].rightId, "b");
  assert.match(result[0].reasons.join(" "), /rovnakej stránke/);
  assert.ok(result.every(x=>x.leftId !== "d" && x.rightId !== "d"));
});

test("candidate listing is deterministic, limited, and never treats matching filenames as confirmed duplicates", () => {
  const groups = Array.from({length:12},(_,i)=>item("i"+i,"Banner "+i,"banner",["same.tsx"]));
  const first = suggestOwnerVisualPairs(groups,5);
  const second = suggestOwnerVisualPairs(groups,5);
  assert.equal(first.length,5);
  assert.deepEqual(first,second);
  assert.ok(first.every(x=>x.reasons.some(s=>/odlišné exporty/.test(s))));
  assert.deepEqual(suggestOwnerVisualPairs(groups,0),[]);
});

test("UI enables one-click review, but does not automatically merge or publish", () => {
  const ui = readFileSync("components/admin-visual-library-owner-compare.tsx","utf8");
  assert.match(ui, /suggestOwnerVisualPairs\(groups, 10\)/);
  assert.match(ui, /selectSuggested\(a.id, b.id\)/);
  assert.match(ui, /Nejde o potvrdené grafické ani kódové duplicity/);
  assert.match(ui, /setLeftId\(a\)/);
  assert.match(ui, /setRightId\(b\)/);
  assert.doesNotMatch(ui, /publishVisualDraft|method:\s*"POST"|DELETE FROM/);
});
