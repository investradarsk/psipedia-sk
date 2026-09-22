import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  DIRECTORY_ADMIN_PAGE_SIZE,
  directoryAdminHref,
  directoryAdminMembershipFilters,
  directoryAdminMembershipFingerprint,
  directoryAdminMembershipQuery,
  parseDirectoryAdminFilters,
  queryDirectoryAdmin,
} from "../lib/directory-admin-query.ts";
import {
  mergeDirectoryPublicContactData,
  readDirectoryPublicContacts,
} from "../lib/directory-profile-metadata.ts";

const categories = [
  { slug: "veterinari", label: "Veterinári" },
  { slug: "treneri", label: "Psí tréneri a psie školy" },
  { slug: "salony-a-sluzby", label: "Salóny" },
];
const categorySlugs = new Set(categories.map((item) => item.slug));
const isCategory = (value) => categorySlugs.has(value);
const filters = (overrides = {}) => ({
  category: "", status: "all", q: "", region: "", district: "", city: "",
  verification: "all", media: "all", page: 1, ...overrides,
});

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE directory_profiles (
    id INTEGER PRIMARY KEY, slug TEXT, name TEXT, category TEXT, status TEXT, services_json TEXT,
    city TEXT, district TEXT, region TEXT, image_url TEXT, verified INTEGER, featured INTEGER,
    updated_at TEXT
  )`);
  const insert = sqlite.prepare("INSERT INTO directory_profiles VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)");
  for (let i = 1; i <= 127; i++) {
    const zilina = i === 61;
    insert.run(
      i,
      `vet-${i}`,
      `Veterina ${String(i).padStart(3, "0")}`,
      "veterinari",
      i <= 61 ? "draft" : "published",
      JSON.stringify(zilina ? ["Fyzioterapia", "Kúpanie"] : ["Preventívna starostlivosť"]),
      zilina ? "Žilina" : "Nitra",
      zilina ? "Žilina" : "Nitra",
      zilina ? "Žilinský kraj" : "Nitriansky kraj",
      i === 1 ? "https://example.test/vet.jpg" : null,
      i === 2 ? 1 : 0,
      String(i).padStart(3, "0"),
    );
  }
  insert.run(128, "trener-bratislava", "EduDog", "treneri", "draft", JSON.stringify(["Poslušnosť"]), "Bratislava", "Bratislava I", "Bratislavský kraj", null, 1, "128");
  insert.run(129, "salon-trnava", "Psí salón", "salony-a-sluzby", "published", JSON.stringify(["Kúpanie"]), "Trnava", "Trnava", "Trnavský kraj", "https://example.test/salon.jpg", 0, "129");
  const db = {
    prepare(query) {
      return {
        bind(...args) { this.args = args; return this; },
        async first() { return sqlite.prepare(query).get(...(this.args ?? [])); },
        async all() { return { results: sqlite.prepare(query).all(...(this.args ?? [])) }; },
      };
    },
  };
  return { db };
}

test("all profiles are counted independently of the 50-row page", async () => {
  const { db } = fixture();
  const result = await queryDirectoryAdmin(db, filters(), categories);
  assert.equal(result.resultCount, 129);
  assert.equal(result.items.length, DIRECTORY_ADMIN_PAGE_SIZE);
  assert.equal(result.pages, 3);
  assert.deepEqual({ ...result.counts }, { total: 129, published: 67, draft: 62, archived: 0 });
  assert.ok(result.options.regions.includes("Nitriansky kraj"));
  assert.ok(result.options.districts.includes("Žilina"));
  assert.ok(result.options.cities.includes("Bratislava"));
});

test("category, publication, location, verification and media filters combine", async () => {
  const { db } = fixture();
  assert.equal((await queryDirectoryAdmin(db, filters({ category: "veterinari" }), categories)).resultCount, 127);
  assert.equal((await queryDirectoryAdmin(db, filters({ category: "veterinari", status: "draft" }), categories)).resultCount, 61);
  assert.equal((await queryDirectoryAdmin(db, filters({ region: "Žilinský kraj", district: "Žilina", city: "Žilina" }), categories)).resultCount, 1);
  assert.equal((await queryDirectoryAdmin(db, filters({ category: "veterinari", verification: "verified" }), categories)).resultCount, 1);
  assert.equal((await queryDirectoryAdmin(db, filters({ category: "veterinari", media: "with-image" }), categories)).resultCount, 1);
  assert.equal((await queryDirectoryAdmin(db, filters({ category: "veterinari", status: "published", city: "Žilina" }), categories)).resultCount, 0);
});

test("accent-insensitive search covers name, city, district, region, category label and services", async () => {
  const { db } = fixture();
  for (const q of ["Veterina 061", "Žilina", "zilina", "Nitriansky", "Veterinári", "Fyzioterapia", "Kupanie"]) {
    assert.ok((await queryDirectoryAdmin(db, filters({ q }), categories)).resultCount >= 1, q);
  }
});

test("search combines with all other membership filters and empty search is neutral", async () => {
  const { db } = fixture();
  assert.equal((await queryDirectoryAdmin(db, filters({
    category: "veterinari", status: "draft", q: "Žilina", region: "Žilinský kraj",
    district: "Žilina", city: "Žilina", verification: "unverified", media: "without-image",
  }), categories)).resultCount, 1);
  assert.equal((await queryDirectoryAdmin(db, filters({ category: "veterinari", q: "   " }), categories)).resultCount, 127);
});

test("pagination works beyond 50 rows and clamps an out-of-range page", async () => {
  const { db } = fixture();
  const second = await queryDirectoryAdmin(db, filters({ category: "veterinari", page: 2 }), categories);
  assert.equal(second.items.length, 50);
  assert.equal(second.resultCount, 127);
  assert.equal(second.page, 2);
  const last = await queryDirectoryAdmin(db, filters({ category: "veterinari", page: 999 }), categories);
  assert.equal(last.page, 3);
  assert.equal(last.items.length, 27);
});

test("URL parsing normalizes filters safely", () => {
  assert.deepEqual(
    parseDirectoryAdminFilters(new URLSearchParams("category=veterinari&status=draft&q=%20klinika%20&region=Nitriansky+kraj&district=Nitra&city=Nitra&verification=verified&media=with-image&page=2"), isCategory),
    filters({ category: "veterinari", status: "draft", q: "klinika", region: "Nitriansky kraj", district: "Nitra", city: "Nitra", verification: "verified", media: "with-image", page: 2 }),
  );
  assert.deepEqual(parseDirectoryAdminFilters(new URLSearchParams("category=bogus&status=bogus&verification=maybe&media=broken&page=-3"), isCategory), filters());
  assert.equal(parseDirectoryAdminFilters(new URLSearchParams("status=archived"), isCategory).status, "archived");
  assert.deepEqual(parseDirectoryAdminFilters(new URLSearchParams("page=2oops"), isCategory), filters());
});

test("pagination URLs preserve membership filters while filter changes can reset page", () => {
  const current = filters({
    category: "veterinari", status: "draft", q: "klinika", region: "Nitriansky kraj",
    district: "Nitra", city: "Nitra", verification: "verified", media: "with-image", page: 2,
  });
  assert.equal(
    directoryAdminHref(current),
    "/admin/adresar?category=veterinari&status=draft&q=klinika&region=Nitriansky+kraj&district=Nitra&city=Nitra&verification=verified&media=with-image&page=2",
  );
  assert.equal(directoryAdminHref({ ...current, page: 1 }).includes("page="), false);
  assert.deepEqual(directoryAdminMembershipFilters(current), {
    category: "veterinari", status: "draft", q: "klinika", region: "Nitriansky kraj",
    district: "Nitra", city: "Nitra", verification: "verified", media: "with-image",
  });
});

test("membership fingerprint excludes page and binds the exact combined WHERE contract", () => {
  const first = filters({
    category: "veterinari", status: "draft", q: " E2E ", region: "Nitriansky kraj",
    district: "Nitra", city: "Nitra", verification: "unverified", media: "without-image", page: 1,
  });
  const second = { ...first, page: 2 };
  const membership = directoryAdminMembershipFilters(first);
  assert.equal(
    directoryAdminMembershipFingerprint(membership),
    directoryAdminMembershipFingerprint(directoryAdminMembershipFilters(second)),
  );
  assert.equal(
    directoryAdminMembershipFingerprint(membership),
    "directory:v2:category=veterinari&status=draft&q=E2E&region=Nitriansky+kraj&district=Nitra&city=Nitra&verification=unverified&media=without-image",
  );
  const query = directoryAdminMembershipQuery(membership, categories);
  for (const expected of [/category = \?/, /status = \?/, /region = \?/, /district = \?/, /city = \?/, /verified = \?/, /image_url/]) {
    assert.match(query.where, expected);
  }
  assert.deepEqual(query.args.slice(0, 6), ["veterinari", "draft", "Nitriansky kraj", "Nitra", "Nitra", 0]);
});


test("public contact metadata round-trips without destroying breed, organization or specialist keys", () => {
  const original = {
    "Telefón": "+421 900 111 222",
    "E-mail": "old@example.test",
    "Webstránka": "https://old.example.test",
    "Facebook": "https://facebook.com/old",
    "Instagram": "https://instagram.com/old",
    "Plemeno": "Labradorský retriever",
    "Organizácia": "Fixture klub",
    "Pohotovosť": "Áno",
  };
  const merged = mergeDirectoryPublicContactData(original, {
    publicPhone: "+421 900 333 444",
    publicEmail: "new@example.test",
    websiteUrl: "https://new.example.test/",
    facebookUrl: "",
    instagramUrl: "https://instagram.com/new",
  });
  assert.equal(merged["Plemeno"], "Labradorský retriever");
  assert.equal(merged["Organizácia"], "Fixture klub");
  assert.equal(merged["Pohotovosť"], "Áno");
  assert.equal(merged["Telefon"], undefined);
  assert.equal(merged["Webstránka"], undefined);
  assert.equal(merged["Facebook"], undefined);
  assert.deepEqual(readDirectoryPublicContacts(merged), {
    phone: "+421 900 333 444",
    email: "new@example.test",
    website: "https://new.example.test/",
    facebook: "",
    instagram: "https://instagram.com/new",
  });
});
