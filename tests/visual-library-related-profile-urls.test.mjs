import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { dynamicUrlKinds } from "../lib/visual-library-dynamic-urls-contract.ts";
import { relatedDynamicUrlKindForPreview } from "../lib/visual-library-preview-related-urls.ts";

test("known visual families can open their relevant published record index", () => {
  const kinds = new Set(dynamicUrlKinds.map((x) => x.id));
  const cases = {
    "directory-card": "directory",
    "directory-services-short": "directory",
    "breed-card": "breeds",
    "event-list": "events",
    "help-card": "help",
    "help-profile": "help",
    "article-list": "articles",
  };
  for (const [id, kind] of Object.entries(cases)) {
    assert.equal(relatedDynamicUrlKindForPreview(id), kind);
    assert.ok(kinds.has(kind));
  }
  assert.equal(relatedDynamicUrlKindForPreview("magazine"), null);
  assert.equal(relatedDynamicUrlKindForPreview("unknown"), null);
});

test("published URLs are disclosed only on demand and are not mislabeled confirmed component renders", () => {
  const catalog = readFileSync("components/admin-visual-library-visual-catalog.tsx", "utf8");
  const dynamic = readFileSync("components/admin-visual-library-dynamic-urls.tsx", "utf8");
  const mapping = readFileSync("lib/visual-library-preview-related-urls.ts", "utf8");
  assert.match(catalog, /relatedDynamicUrlKindForPreview\(chosen\.id\)/);
  assert.match(catalog, /showRelatedProfiles && <AdminVisualLibraryDynamicUrls/);
  assert.match(catalog, /initialKind=\{relatedKind\}/);
  assert.match(catalog, /nie dôkaz, že sa tento komponent/);
  assert.match(dynamic, /initialKind = "directory"/);
  assert.match(dynamic, /kind:initialKind/);
  assert.match(dynamic, /data\.url|item\.url/);
  assert.match(dynamic, /getAdminApiUser|credentials:"same-origin"/);
  assert.match(mapping, /NOT evidence/);
  assert.doesNotMatch(catalog, /method:\s*"(POST|PUT|DELETE)"|DB\.prepare/);
});
