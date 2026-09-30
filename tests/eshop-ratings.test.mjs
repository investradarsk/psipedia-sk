import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const importTs = (path) => import(pathToFileURL(new URL(path, root).pathname).href);

test("e-shop rating domain has exactly five simple 1-5 areas", async () => {
  const domain = await importTs("lib/eshop-rating-domain.ts");
  assert.deepEqual(domain.ESHOP_RATING_FIELDS.map((item) => [item.key, item.label]), [
    ["delivery", "Doručenie"],
    ["communication", "Komunikácia"],
    ["assortment", "Sortiment"],
    ["price", "Ceny"],
    ["overall", "Celková skúsenosť"],
  ]);
});

test("0100 creates e-shop profiles, bounded ratings and five initial published shops", () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    "PRAGMA foreign_keys=ON;" +
    "CREATE TABLE review_authors (" +
    "id TEXT PRIMARY KEY NOT NULL," +
    "email_ciphertext TEXT NOT NULL," +
    "email_hash TEXT NOT NULL UNIQUE," +
    "display_name TEXT," +
    "status TEXT NOT NULL DEFAULT 'ACTIVE'," +
    "email_verified_at TEXT," +
    "deactivated_at TEXT," +
    "created_at TEXT NOT NULL," +
    "updated_at TEXT NOT NULL" +
    ");"
  );
  sqlite.exec(read("drizzle/0100_eshop_ratings.sql"));

  const shops = sqlite.prepare("SELECT slug,status FROM managed_eshops ORDER BY slug").all();
  assert.deepEqual(shops.map((row) => row.slug), ["abc-zoo","petcenter","spokojny-pes","super-zoo","zoohit"]);
  assert.ok(shops.every((row) => row.status === "published"));

  sqlite.prepare("INSERT INTO review_authors (id,email_ciphertext,email_hash,status,email_verified_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
    .run("author-1","cipher","hash","ACTIVE","2026-09-30T08:00:00.000Z","2026-09-30T08:00:00.000Z","2026-09-30T08:00:00.000Z");
  sqlite.prepare("INSERT INTO review_authors (id,email_ciphertext,email_hash,status,email_verified_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
    .run("author-2","cipher-2","hash-2","ACTIVE","2026-09-30T08:00:00.000Z","2026-09-30T08:00:00.000Z","2026-09-30T08:00:00.000Z");

  const shopId = sqlite.prepare("SELECT id FROM managed_eshops WHERE slug='super-zoo'").get().id;
  const insert = sqlite.prepare("INSERT INTO eshop_ratings VALUES (?,?,?,?,?,?,?,?,?,?)");
  insert.run("rating-1",shopId,"author-1",5,4,5,4,5,"2026-09-30T08:10:00.000Z","2026-09-30T08:10:00.000Z");

  assert.throws(
    () => insert.run("rating-2",shopId,"author-1",4,4,4,4,4,"2026-09-30T08:11:00.000Z","2026-09-30T08:11:00.000Z"),
    /UNIQUE constraint failed/,
  );
  assert.throws(
    () => insert.run("rating-3",shopId,"author-2",6,4,4,4,4,"2026-09-30T08:12:00.000Z","2026-09-30T08:12:00.000Z"),
    /CHECK constraint failed/,
  );
  sqlite.close();
});

test("e-shop submission reuses verified reviewer, Turnstile and rate limiting without mandatory review text", () => {
  const route = read("app/api/review-author/eshop-ratings/route.ts");
  const form = read("components/eshop-rating-form.tsx");
  assert.match(route, /requireReviewAuthor/);
  assert.match(route, /enforceProfileReviewSubmissionRateLimits/);
  assert.match(route, /verifyProfileReviewSubmissionTurnstile/);
  assert.match(route, /upsertVerifiedEshopRating/);
  assert.match(form, /reviewAuthorAuthHref/);
  assert.match(form, /Text recenzie nie je potrebný/);
  assert.doesNotMatch(form, /<textarea/);
  assert.match(form, /name=\{name\}/);
});

test("public e-shop score stays separate from external ratings", () => {
  const profile = read("app/recenzie/eshopy/[slug]/page.tsx");
  const hub = read("components/reviews-hub.tsx");
  assert.match(profile, /Externé hodnotenia z Google, Heureky ani samotného e-shopu sa do priemeru Psipedia nezapočítavajú/);
  assert.match(hub, /externé hviezdičky sa do skóre Psipedia nemiešajú/);
});
