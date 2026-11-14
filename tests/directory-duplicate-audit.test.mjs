import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { auditExistingDirectoryDuplicates } from "../lib/directory-duplicate-audit.ts";

const row = (id, name, category, city, overrides = {}) => ({
  id, name, category, city, status: "published", website_url: null,
  phone: null, email: null, additional_categories_json: null, ...overrides,
});

test("same organization across categories is a candidate, not an automatic merge", () => {
  const result = auditExistingDirectoryDuplicates([
    row(202, "AgiPaws", "kynologicke-kluby", "Liptovský Mikuláš", { website_url: "https://www.agipaws.sk/" }),
    row(565, "agipaws", "treneri", "Liptovsky Mikulas", { website_url: "https://agipaws.sk/" }),
  ]);
  assert.equal(result.scanned, 2);
  assert.equal(result.totalCandidates, 1);
  assert.equal(result.candidates[0].confidence, "strong-signals");
  assert.deepEqual(result.candidates[0].signals, ["rovnaké mesto", "rovnaký web"]);
});

test("accent differences match but distinct cities never get merged by a shared phone", () => {
  const result = auditExistingDirectoryDuplicates([
    row(186, "AKADÉMIA Sírius", "kynologicke-kluby", "Zvolen"),
    row(552, "Akadémia Sirius", "treneri", "Zvolen"),
    row(888, "Akadémia Sirius", "treneri", "Bratislava", { phone: "0905123456" }),
    row(889, "AKADÉMIA Sírius", "kynologicke-kluby", "Trnava", { phone: "0905123456" }),
  ]);
  assert.equal(result.totalCandidates, 1);
  assert.equal(result.candidates[0].confidence, "name-location-only");
  assert.deepEqual([result.candidates[0].a.id, result.candidates[0].b.id], [186, 552]);
});

test("cross-listed membership is disclosed without hiding a duplicate record", () => {
  const result = auditExistingDirectoryDuplicates([
    row(1, "Služba A", "treneri", "Nitra", {
      additional_categories_json: '["kynologicke-kluby"]',
      email: "office@example.sk",
    }),
    row(2, "Služba A", "kynologicke-kluby", "Nitra", {
      additional_categories_json: "broken", email: "office@example.sk",
    }),
  ]);
  assert.equal(result.totalCandidates, 1);
  assert.equal(result.candidates[0].alreadyCrossListed, true);
  assert.equal(result.candidates[0].confidence, "strong-signals");
});

test("archived records and unrelated names are excluded", () => {
  const result = auditExistingDirectoryDuplicates([
    row(1, "A", "treneri", "Nitra"),
    row(2, "Mesto", "treneri", "Nitra", { status: "archived" }),
    row(3, "Mesto", "kynologicke-kluby", "Nitra"),
    row(4, "Iná spoločnosť", "treneri", "Nitra"),
  ]);
  assert.equal(result.totalCandidates, 0);
});

test("result truncation and scan incompleteness are explicit", () => {
  const result = auditExistingDirectoryDuplicates([
    row(3, "Jedna spoločnosť", "treneri", "Nitra"),
    row(4, "Jedna spoločnosť", "kynologicke-kluby", "Nitra"),
    row(5, "Jedna spoločnosť", "vencenie", "Nitra"),
  ], { incomplete: true, limit: 1 });
  assert.equal(result.totalCandidates, 3);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.incomplete, true);
});

test("audit endpoint contract is admin-protected and read-only", async () => {
  const store = await readFile(new URL("../lib/directory-duplicate-audit-store.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/admin/adresar/migracia/page.tsx", import.meta.url), "utf8");
  assert.match(page, /requireAdminPageUser/);
  assert.match(store, /FROM directory_profiles/);
  assert.match(store, /LIMIT/);
  assert.doesNotMatch(store, /(?:UPDATE|DELETE|INSERT|REPLACE)\s+directory_profiles/i);
  assert.doesNotMatch(store, /fetch\(|notionRequest\(|google/i);
});
