import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { hasHomepageRealImage, HOMEPAGE_REAL_IMAGE_SQL } from "../lib/homepage-media.ts";

const repoFile = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const cases = [
  { id: 1, status: "published", image_url: "/media/events/2026/real.webp", image_key: "events/2026/real.webp" },
  { id: 2, status: "published", image_url: null, image_key: null },
  { id: 3, status: "published", image_url: "/images/hero-labrador.webp", image_key: null },
  { id: 4, status: "draft", image_url: "/media/events/2026/draft.webp", image_key: "events/2026/draft.webp" },
  { id: 5, status: "published", image_url: "/media/safe/secret.webp", image_key: "safe/secret.webp" },
  { id: 6, status: "published", image_url: "/media/quarantine/not-approved.webp", image_key: "quarantine/not-approved.webp" },
  { id: 7, status: "published", image_url: "https://remote.example/photo.webp", image_key: null },
  { id: 8, status: "published", image_url: "/media/events/2026/mismatch.webp", image_key: "events/2026/different.webp" },
  { id: 9, status: "published", image_url: "/media/events/2026/second.webp", image_key: "events/2026/second.webp" },
  { id: 10, status: "published", image_url: "/media/events/2026/third.webp", image_key: "events/2026/third.webp" },
  { id: 11, status: "published", image_url: "/media/events/2026/fourth.webp", image_key: "events/2026/fourth.webp" },
];

test("homepage canonical media admits only paired public R2 images, never fallback or restricted keys", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE fixtures (id INTEGER PRIMARY KEY, status TEXT, image_url TEXT, image_key TEXT)");
    const insert = db.prepare("INSERT INTO fixtures(id, status, image_url, image_key) VALUES (?, ?, ?, ?)");
    for (const row of cases) insert.run(row.id, row.status, row.image_url, row.image_key);
    const selected = db.prepare(`SELECT id FROM fixtures WHERE status = 'published' AND ${HOMEPAGE_REAL_IMAGE_SQL} ORDER BY id LIMIT ?`);
    assert.deepEqual(selected.all(3).map((row) => row.id), [1, 9, 10]);
    assert.deepEqual(selected.all(12).map((row) => row.id), [1, 9, 10, 11]);
    assert.deepEqual(db.prepare(`SELECT id FROM fixtures WHERE status = 'draft' AND ${HOMEPAGE_REAL_IMAGE_SQL}`).all().map((row) => row.id), [4]);
    const empty = db.prepare(`SELECT id FROM fixtures WHERE status = 'published' AND id BETWEEN 2 AND 8 AND ${HOMEPAGE_REAL_IMAGE_SQL}`);
    assert.deepEqual(empty.all(), []);
    for (const row of cases) {
      const sqlEligible = db.prepare(`SELECT count(*) AS n FROM fixtures WHERE id = ? AND ${HOMEPAGE_REAL_IMAGE_SQL}`).get(row.id).n === 1;
      assert.equal(hasHomepageRealImage({ imageUrl: row.image_url, imageKey: row.image_key }), sqlEligible, `JS/SQL disagreement on case ${row.id}`);
    }
  } finally { db.close(); }
});

test("homepage-only reads filter before bounded LIMIT and preserve publication policy", async () => {
  const [directory, events, help, page] = await Promise.all([
    repoFile("lib/directory-store.ts"), repoFile("lib/event-store.ts"), repoFile("lib/help-store.ts"), repoFile("app/page.tsx"),
  ]);
  for (const [source, functionName] of [
    [directory, "getHomepageDirectoryProfilesWithImages"],
    [events, "getHomepageUpcomingEventsWithImages"],
    [help, "getHomepageHighlightedHelpCasesWithImages"],
  ]) {
    const segment = source.slice(source.indexOf(`export async function ${functionName}`)).split("\nexport async function ")[0];
    assert.match(segment, /status = 'published'/);
    assert.match(segment, /HOMEPAGE_REAL_IMAGE_SQL/);
    assert.match(segment, /Math\.min\(12, Math\.trunc\(limit\)\)/);
    assert.match(segment, /ORDER BY[\s\S]*LIMIT \?/);
    assert.doesNotMatch(segment, /fetch\(|\.filter\(\(.*imageUrl/);
    assert.match(page, new RegExp(functionName));
  }
  assert.match(events, /getHomepageUpcomingEventsWithImages[\s\S]*cancelled = 0/);
  assert.match(help, /getHomepageHighlightedHelpCasesWithImages[\s\S]*resolved = 0/);
  assert.match(help, /getHomepageHighlightedHelpCasesWithImages[\s\S]*category NOT IN/);
  assert.match(page, /directoryProfileHref\(profile\)/);
  assert.match(page, /eventHref\(event\)/);
  assert.match(page, /helpCaseHref\(item\)/);
});

test("homepage image-backed cards cannot render placeholder nodes; empty states keep category CTAs", async () => {
  const [page, editorial, css] = await Promise.all([
    repoFile("app/page.tsx"), repoFile("components/home-editorial.tsx"), repoFile("app/home-v2.module.css"),
  ]);
  for (const token of ["home-event-placeholder", "home-vet-mark", "home-help-placeholder"]) assert.doesNotMatch(page, new RegExp(token));
  for (const selector of ["data-home-events-empty", "data-home-veterinarians-empty", "data-home-help-empty", "data-home-section-cta"]) assert.match(page, new RegExp(selector));
  assert.match(editorial, /variant="featured" headingLevel=\{3\} omitMissingImage/);
  for (const selector of ["home-event-list", "home-vet-list", "home-help-grid"]) {
    assert.match(css, new RegExp(`\\.${selector}\\)[\\s\\S]*?repeat\\(auto-fit, minmax`));
  }
});
