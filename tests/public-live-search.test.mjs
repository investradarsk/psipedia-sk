import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { groupPortalSearchSuggestions } from "../lib/portal-search-suggestions.ts";

const file = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("autosuggest groups canonical results without inventing destinations", () => {
  const rows = [
    { href: "/plemena/labradorsky-retriever", title: "Labradorský retriever", kind: "breed", type: "Plemeno", description: "Retriever", score: 0 },
    { href: "/clanky/a", title: "Výcvik", kind: "article", type: "Článok", description: "Rady", score: 3 },
    { href: "/adresar/veterinari/a", title: "Veterinár", kind: "directory", type: "Veterinár", description: "Nitra", score: 4 },
    { href: "/podujatia/a", title: "Výstava", kind: "event", type: "Podujatie", description: "", score: 5 },
    { href: "/pomoc-psom/adopcia/a", title: "Azor", kind: "adoption", type: "Pes na adopciu", description: "", score: 6 },
    { href: "https://outside.test", title: "Externá stránka", kind: "article", type: "Článok", description: "", score: 8 },
  ];
  const groups = groupPortalSearchSuggestions(rows);
  assert.deepEqual(groups.map((group) => group.label), [
    "Plemená", "Články a novinky", "Služby a odborníci", "Podujatia", "Pomoc psom",
  ]);
  assert.equal(groups.flatMap((group) => group.items).length, 5);
  assert.equal(groups[0].items[0].href, "/plemena/labradorsky-retriever");
  assert.equal(groupPortalSearchSuggestions(rows, 1, 2).flatMap((g) => g.items).length, 2);
});

test("autocomplete uses published-only canonical search without extra DB indexes", () => {
  const route = file("app/api/public/search/suggestions/route.ts");
  const helper = file("lib/portal-search-suggestions.ts");
  assert.match(route, /searchPortal\(q, \{ page: 1, pageSize: 48 \}\)/);
  assert.match(route, /no-store/);
  assert.match(route, /q.length < 2/);
  assert.match(helper, /maxPerGroup = 4/);
  assert.doesNotMatch(route, /SELECT|notion|DATABASE_URL|migration/i);
});

test("header keeps existing keyboard dialog and autocomplete while homepage GET forms stay scoped", () => {
  const header = file("components/site-header.tsx");
  const home = file("components/home-portal-search.tsx");
  const live = file("components/public-search-suggestions.tsx");
  assert.match(header, /aria-modal="true"/);
  assert.match(header, /if \(event.key === "Escape"\)/);
  assert.match(header, /<PublicSearchSuggestions/);
  assert.match(home, /<form action=\{action\} method="get"/);
  assert.match(home, /name=\{inputName\}/);
  assert.match(home, /hidden.map/);
  assert.match(live, /AbortController/);
  assert.match(live, /ArrowDown/);
  assert.match(live, /aria-selected/);
  assert.match(home, /role=\{enableSuggestions \? "combobox" : undefined\}/);
  assert.match(header, /role="combobox"/);
  assert.match(live, /aria-expanded", String\(hasListbox\)/);
  assert.match(live, /if \(hasListbox\) input\.setAttribute\("aria-controls", listId\)/);
  assert.match(live, /Zobraziť všetky výsledky/);
});
