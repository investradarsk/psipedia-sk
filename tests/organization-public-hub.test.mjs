import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildPublishedOrganizationHubQuery,
  PUBLIC_ORGANIZATION_PREDICATE,
} from "../lib/help-organization-store.ts";

const pageSource = fs.readFileSync(new URL("../app/organizacie/page.tsx", import.meta.url), "utf8");
const helpOverviewSource = fs.readFileSync(new URL("../components/help-overview.tsx", import.meta.url), "utf8");
const sitemapSource = fs.readFileSync(new URL("../app/sitemap.ts", import.meta.url), "utf8");
const organizationSeoSource = fs.readFileSync(new URL("../lib/organization-seo.ts", import.meta.url), "utf8");

test("organization hub public read is fail-closed and unbounded by a UI pagination cap", () => {
  const query = buildPublishedOrganizationHubQuery();
  assert.equal(
    PUBLIC_ORGANIZATION_PREDICATE,
    "o.status = 'PUBLISHED' AND o.published_at IS NOT NULL AND o.archived_at IS NULL",
  );
  assert.match(query, /o\.status = 'PUBLISHED'/);
  assert.match(query, /o\.published_at IS NOT NULL/);
  assert.match(query, /o\.archived_at IS NULL/);
  assert.match(query, /ORDER BY o\.name COLLATE NOCASE ASC, o\.id ASC/);
  assert.doesNotMatch(query, /ORDER BY o\.name COLLATE NOCASE ASC, o\.id ASC\s+LIMIT\s+\?/);
  assert.doesNotMatch(query, /\b(?:UPDATE|INSERT|DELETE)\b/i);
});

test("organization hub renders canonical detail discovery and collection schema", () => {
  assert.match(pageSource, /listPublishedOrganizationsForHub/);
  assert.match(pageSource, /isCanonicalOrganizationSlug/);
  assert.match(pageSource, /buildCollectionPageJsonLd/);
  assert.match(pageSource, /path: "\/organizacie"/);
  assert.match(pageSource, /title="Organizácie pomáhajúce psom"/);
  assert.match(pageSource, /const href = `\/organizacie\/\$\{organization\.slug\}`/);
  assert.match(pageSource, /data-organization-hub-card/);
});

test("organization hub is crawlably connected from Pomoc psom and included in sitemap", () => {
  assert.match(helpOverviewSource, /href="\/organizacie"/);
  assert.match(sitemapSource, /sitemapEntry\("\/organizacie"/);
});

test("organization detail SEO engine remains on its existing canonical route", () => {
  assert.match(organizationSeoSource, /return `\/organizacie\/\$\{encodeURIComponent\(slug\)\}`/);
  assert.match(organizationSeoSource, /name: "Pomoc psom", item: absoluteUrl\("\/pomoc-psom"\)/);
});
