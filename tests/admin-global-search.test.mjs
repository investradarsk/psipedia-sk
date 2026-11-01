import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { searchAdminRecords } from "../lib/admin-global-search.ts";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("authenticated global search is bounded, read-only and searches real admin records", async () => {
  const queried = [];
  const db = {
    prepare(sql) {
      assert.match(sql, /SELECT .* FROM /);
      assert.doesNotMatch(sql, /INSERT|UPDATE|DELETE/);
      assert.doesNotMatch(sql, /Robert_foo/);
      return {
        bind(...args) {
          assert.ok(args.length > 0);
          assert.ok(args.every(value => value === "Robert_foo"));
          queried.push(sql);
          return { all: async () => ({ results: [{ id: 12, title: "Robert", subtitle: "Mesto" }] }) };
        },
      };
    },
  };
  const result = await searchAdminRecords(db, "Robert_foo");
  assert.equal(queried.length, 8);
  assert.equal(result.incomplete, false);
  assert.equal(result.results.length, 8);
  assert.ok(result.results.every(item => item.href.startsWith("/admin/") && item.title === "Robert"));
  const noSearch = await searchAdminRecords(db, "R");
  assert.equal(noSearch.results.length, 0);
  assert.equal(queried.length, 8);
});

test("one unavailable database module cannot hide other matching profiles", async () => {
  let count = 0;
  const db = {
    prepare() {
      count += 1;
      const fail = count === 3;
      return { bind: () => ({ all: async () => {
        if (fail) throw new Error("migration unavailable");
        return { results: [{ id: 2, title: "Pes", subtitle: "Aktívny" }] };
      } }) };
    },
  };
  const result = await searchAdminRecords(db, "Pes");
  assert.equal(result.incomplete, true);
  assert.equal(result.results.length, 7);
});

test("the admin search is available from every AdminShell, with auth and clean section links", () => {
  const shell = read("components/admin-shell.tsx");
  const nav = read("components/admin-quick-navigation.tsx");
  const route = read("app/api/admin/global-search/route.ts");
  const hub = read("app/admin/pomoc-psom/page.tsx");
  const grid = read("components/admin-help-unified-table.tsx");
  const tour = read("components/admin-tour-button.tsx");
  assert.match(shell, /<AdminQuickNavigation\s*\/>/);
  assert.match(shell, /<AdminTourButton\s*\/>/);
  assert.match(nav, /onChange=\{event => \{ setQuery/);
  assert.match(nav, /\/api\/admin\/global-search\?q=/);
  assert.match(nav, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(route, /getAdminApiUser\(\)/);
  assert.match(route, /unauthorizedAdminResponse\(\)/);
  assert.match(route, /no-store/);
  assert.match(hub, /loadTable\(/);
  assert.match(grid, /<AdminRecordTable/);
  assert.match(grid, /"\/admin\/pomoc-psom\?"/);
  assert.match(tour, /await import\("driver\.js"\)/);
  assert.match(tour, /tour\.drive\(\)/);
});
