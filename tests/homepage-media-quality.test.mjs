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
  // Upcoming events without uploaded photos remain visible; EventImage provides safe category artwork.
  const upcoming = events.slice(events.indexOf("export async function getHomepageUpcomingEventsWithImages")).split("\nexport async function ")[0];
  assert.match(upcoming, /status = 'published'/);
  assert.match(upcoming, /cancelled = 0/);
  assert.match(upcoming, /ORDER BY start_date ASC, start_time ASC, id ASC LIMIT \?/);
  assert.doesNotMatch(upcoming, /HOMEPAGE_REAL_IMAGE_SQL/);
  assert.match(page, /getHomepageUpcomingEventsWithImages\(3\)/);
  assert.match(help, /getHomepageHighlightedHelpCasesWithImages[\s\S]*resolved = 0/);
  assert.match(help, /getHomepageHighlightedHelpCasesWithImages[\s\S]*category NOT IN/);
  assert.match(page, /directoryProfileHref\(profile\)/);
  assert.match(page, /eventHref\(event\)/);
  assert.match(page, /helpCaseHref\(item\)/);
});

test("homepage breed cards read only presentation fields, not the editor's full JSON payload", async () => {
  const [store, page] = await Promise.all([
    repoFile("lib/breed-store.ts"), repoFile("app/page.tsx"),
  ]);
  const start = store.indexOf("export async function listHomepageFeaturedBreeds(");
  const end = store.indexOf("export async function getManagedBreed(", start);
  assert.ok(start >= 0 && end > start, "a dedicated homepage breed projection exists");
  const fn = store.slice(start, end);
  assert.match(fn, /SELECT slug,name,image_url,intro\s+FROM managed_breeds/);
  assert.match(fn, /WHERE id IN \(\$\{canonicalBreedIdsSql\}\)/);
  assert.match(fn, /ORDER BY fci_group,name LIMIT \?/);
  assert.match(fn, /withAvailableBreedImages/);
  assert.doesNotMatch(fn, /\$\{select\}|fromRow\(|fci_standard_json|editorial_json|gallery_json/);
  assert.match(page, /listHomepageFeaturedBreeds\(6\)/);
});

test("homepage previews preserve safe fallbacks and truthful empty messages", async () => {
  const [page, editorial, css, articleSelection, publicStyles] = await Promise.all([
    repoFile("app/page.tsx"), repoFile("components/home-editorial.tsx"), repoFile("app/home-v2.module.css"),
    repoFile("lib/homepage-content.ts"), repoFile("components/public-visual-system/public-visual-system.module.css"),
  ]);
  for (const token of ["home-event-placeholder", "home-vet-mark", "home-help-placeholder", "Nové podujatia práve dopĺňame", "Momentálne tu nie je otvorená výzva"]) assert.doesNotMatch(page, new RegExp(token));
  for (const selector of ["data-home-events-empty", "data-home-veterinarians-empty", "data-home-help-empty"]) assert.match(page, new RegExp(selector));
  assert.match(editorial, /data-home-section-cta/);
  assert.match(editorial, /variant="featured" headingLevel=\{3\} omitMissingImage/);
  assert.match(articleSelection, /articles\.filter\(\(article\) => Boolean\(article\.image\?\.trim\(\)\)\)/);
  assert.match(publicStyles, /\.articleListMedia\s*\{[^}]*aspect-ratio:\s*4 \/ 3/s);
  for (const selector of ["home-event-list", "home-vet-list", "home-help-grid"]) {
    assert.match(css, new RegExp(`\\.${selector}\\)[\\s\\S]*?repeat\\(auto-fit, minmax`));
  }
});


test("homepage cards use projected SQL rather than fetching full profile and event bodies", async () => {
  const specs = [
    ["lib/event-store.ts", "getHomepageUpcomingEventsWithImages",
      ["id", "slug", "title", "event_type", "start_date", "end_date", "city", "image_url", "image_display", "thumbnail_display_json"],
      ["description", "practical_info", "seo_json", "website_url", "registration_url"]],
    ["lib/help-store.ts", "getHomepageHighlightedHelpCasesWithImages",
      ["id", "slug", "title", "category", "status", "city", "image_url", "thumbnail_display_json", "urgent", "resolved"],
      ["description", "contact_note", "seo_json", "action_url", "raised_amount"]],
    ["lib/directory-store.ts", "getHomepageDirectoryProfilesWithImages",
      ["id", "slug", "name", "category", "city", "district", "image_url", "thumbnail_display_json"],
      ["description", "services_json", "internal_email", "qualifications_json", "seo_json"]],
  ];
  for (const [file, fn, expected, excluded] of specs) {
    const source = await repoFile(file);
    const start = source.indexOf("export async function " + fn);
    assert.ok(start >= 0, fn + " exists");
    const part = source.slice(start).split("\nexport async function ")[0];
    const match = part.match(/SELECT ([\s\S]*?)\s+FROM (?:managed_events|help_cases|directory_profiles)/);
    assert.ok(match, fn + " uses a direct SELECT projection");
    assert.doesNotMatch(match[1], /SELECT\s+\*|\bDIRECTORY_PROFILE_COLUMNS\b/);
    for (const field of expected) assert.match(match[1], new RegExp("\\b" + field + "\\b"), fn + " requires " + field);
    for (const field of excluded) assert.doesNotMatch(match[1], new RegExp("\\b" + field + "\\b"), fn + " excludes " + field);
    // The directory and help slots intentionally require approved photos, whereas
    // events remain eligible without a photo and display category fallback artwork.
    if (fn === "getHomepageUpcomingEventsWithImages") assert.doesNotMatch(part, /HOMEPAGE_REAL_IMAGE_SQL/);
    else assert.match(part, /HOMEPAGE_REAL_IMAGE_SQL/);
    assert.match(part, /status = 'published'/);
    assert.match(part, /LIMIT \?/);
  }
});

test("homepage directory cards preserve legacy district fallback with validated metadata", async () => {
  const source = await repoFile("lib/directory-store.ts");
  const start = source.indexOf("export async function getHomepageDirectoryProfilesWithImages");
  const part = source.slice(start).split("\nexport async function ")[0];
  assert.match(part, /json_valid\(source_data_json\)/);
  assert.match(part, /json_type\(source_data_json/);
  assert.match(part, /fallback_district/);
  assert.doesNotMatch(part, /rowToPublicProfile|safeImportData|SELECT\s+\*/);

  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE d (source_data_json TEXT)");
    for (const value of ['{"Okres":"Nitra"}', "corrupt-json", '{"Okres":["not-scalar"]}', '{"Okres":17}']) {
      db.prepare("INSERT INTO d VALUES (?)").run(value);
    }
    const sql = "SELECT CASE WHEN json_valid(source_data_json) AND json_type(source_data_json, '$.\"Okres\"') IN ('text', 'integer', 'real') THEN CAST(json_extract(source_data_json, '$.\"Okres\"') AS TEXT) ELSE NULL END AS district FROM d";
    assert.deepEqual(db.prepare(sql).all().map(row => row.district), ["Nitra", null, null, "17"]);
  } finally { db.close(); }
});
