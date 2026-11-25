import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { getDirectoryFilterDefinition } from "../lib/directory-filter-contract.ts";
import { prepareGeneralDirectorySourceImport } from "../lib/directory-import-preservation.ts";

const emergency = getDirectoryFilterDefinition("veterinari.emergency");
const visits = getDirectoryFilterDefinition("veterinari.home_visits");
const walking = getDirectoryFilterDefinition("vencenie.group_walks");
assert.ok(emergency && visits && walking);

const merge = (incoming, current = null, category = "veterinari") =>
  JSON.parse(prepareGeneralDirectorySourceImport(incoming, category, current === null ? null : JSON.stringify(current)));

test("fresh service profile imports only explicit registered values, not free-text guesses", () => {
  const record = merge({ name: "Vet", [emergency.d1.key]: "Áno", [visits.d1.key]: "unknown", note: "Pohotovosť nie je známa" });
  assert.equal(record[emergency.d1.key], "yes");
  assert.equal(record[visits.d1.key], "unknown");
  assert.equal(record.note, "Pohotovosť nie je známa");
  assert.equal(merge({ name: "Vet", note: "Pohotovosť áno" })[emergency.d1.key], undefined);
});

test("existing draft and repeated import preserve explicit no, unknown, and unrelated metadata", () => {
  const existing = {
    [emergency.d1.key]: "no",
    [visits.d1.key]: "unknown",
    "_psipedia_profile_review_reviewed_at": "2026-10-10T00:00:00Z",
    "_psipedia_quality_phone_status": "NOT_FOUND",
    "Plemeno": "Labrador",
    externalCustom: { nested: 4 },
    nullLegacy: null,
  };
  const withoutFilters = merge({ name: "Vet updated", "Nové pole": 3, "Plemeno": null }, existing);
  assert.equal(withoutFilters[emergency.d1.key], "no");
  assert.equal(withoutFilters[visits.d1.key], "unknown");
  assert.equal(withoutFilters["Plemeno"], "Labrador");
  assert.equal(merge({ "Plemeno": "   " }, existing)["Plemeno"], "Labrador");
  assert.equal(withoutFilters.nullLegacy, null);
  assert.equal(withoutFilters._psipedia_profile_review_reviewed_at, existing._psipedia_profile_review_reviewed_at);
  assert.equal(withoutFilters._psipedia_quality_phone_status, "NOT_FOUND");
  assert.deepEqual(withoutFilters.externalCustom, { nested: 4 });
  const repeated = merge({ [emergency.d1.key]: "nie", [visits.d1.key]: "unknown" }, withoutFilters);
  assert.equal(repeated[emergency.d1.key], "no");
  assert.deepEqual(merge({ [emergency.d1.key]: null, [visits.d1.key]: "" }, repeated), repeated);
});

test("explicit yes, no and unknown differ from absent/null/empty", () => {
  assert.equal(merge({ [emergency.d1.key]: "yes" })[emergency.d1.key], "yes");
  assert.equal(merge({ [emergency.d1.key]: "no" })[emergency.d1.key], "no");
  assert.equal(merge({ [emergency.d1.key]: "unknown" })[emergency.d1.key], "unknown");
  assert.equal(merge({ [emergency.d1.key]: null })[emergency.d1.key], undefined);
  assert.equal(merge({ [emergency.d1.key]: "" })[emergency.d1.key], undefined);
  assert.equal(merge({})[emergency.d1.key], undefined);
});

test("invalid filter, category spoofing, reserved metadata and conflicts reject whole import", () => {
  for (const bad of [false, 0, "niekedy", "Pohotovosť", [], {}]) {
    assert.throws(() => merge({ [emergency.d1.key]: bad }), /Neplatná hodnota/);
  }
  assert.throws(() => merge({ [walking.d1.key]: "yes" }), /mimo kategórie/);
  assert.throws(() => merge({ _psipedia_filter_v1_veterinari_not_registered: "yes" }), /Nepovolený/);
  assert.throws(() => merge({ _psipedia_quality_phone_status: "NOT_FOUND" }), /Nepovolený/);
  assert.throws(() => merge({ [emergency.d1.key]: "yes" }, { [emergency.d1.key]: "no" }), /Konflikt filtra/);
  assert.throws(() => merge({ [emergency.d1.key]: "no" }, { [emergency.d1.key]: "unknown" }), /Konflikt filtra/);
  assert.throws(() => merge({ [emergency.d1.key]: "yes" }, { [emergency.d1.key]: "garbage" }), /neplatnú hodnotu/);
  assert.throws(() => prepareGeneralDirectorySourceImport({}, "veterinari", "[]"), /JSON objekt/);
  assert.throws(() => prepareGeneralDirectorySourceImport({}, "veterinari", "{"), /nie je platný JSON/);
});

test("retired bulk import fails closed before any canonical mutation, even for a new draft", () => {
  const route = readFileSync("app/api/admin/import/route.ts", "utf8");
  const start = route.indexOf("if (profiles.some(");
  const end = route.indexOf("const statements:", start);
  assert.ok(start >= 0 && end > start);
  const guard = route.slice(start, end);
  const check = (actions) => runInNewContext(guard, {
    profiles: actions.map(() => ({})), plan: { actions: { profiles: actions } },
  });
  for (const action of ["inserted", "updated", "rejected"]) {
    assert.throws(() => check([action]), /Hromadný import Adresára/);
    assert.throws(() => check(["skipped", action]), /Hromadný import Adresára/);
  }
  assert.doesNotThrow(() => check(["skipped", "skipped"]));
  assert.doesNotThrow(() => check([]));
  assert.doesNotMatch(route, /INSERT INTO directory_profiles|UPDATE directory_profiles/i);
});

test("preview preserves existing profile identities and requires explicit confirmation", () => {
  const plan = readFileSync("lib/admin-import-plan.ts", "utf8");
  const route = readFileSync("app/api/admin/import/route.ts", "utf8");
  assert.match(plan, /if \(insertOnly\) return \{ action: "skipped" \}/);
  assert.match(plan, /key, profileKeys, existing\?\.status,[\s\S]*?true,/);
  assert.match(plan, /result\.action !== "inserted"/);
  assert.match(plan, /prepareGeneralDirectorySourceImport\(row, identity\.category, null\)/);
  assert.match(plan, /importKey patrí inému category\+slug/);
  assert.match(route, /plan\.preview\.totals\.rejected > 0/);
  assert.match(route, /payload\.confirmed !== true/);
});
