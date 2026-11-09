import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BREED_NOTION_PRIORITY_FIELDS } from "../lib/notion-breed-property-registry.ts";
import { summarizeBreedWorkcopyBaselineDifferences } from
  "../lib/production-breed-workcopy-field-audit.mjs";
import {
  workCopyChangedEditorialIds, workCopyNonblankChangedFields,
  workCopyAdminChangedFields,
} from "../lib/notion-breed-workcopy-field-events.mjs";
import { planBreedWorkCopyFieldWrite } from
  "../lib/notion-breed-workcopy-patch-bridge.mjs";

const entries = BREED_NOTION_PRIORITY_FIELDS.filter(x => x.mode === "content");
const fieldIds = entries.map(x => x.id);
const seeded = () => Object.fromEntries(fieldIds.map(id => [id,
  id === "editorialComplete" || id === "seo.noindex" ? false :
  id === "gallery" || id === "relatedBreedIds" ||
  id === "relatedArticleIds" || id === "directoryProfileIds" ||
  id === "sports" ? [] : "",
]));
const row = (id, notion, admin) => ({
  breed_id: id, status: "SHADOW",
  work_sync_receipt: "breed-field-v1:" + JSON.stringify({
    hash: "0".repeat(64),
    notion: JSON.stringify(notion), admin: JSON.stringify(admin),
  }),
});
function cohort() {
  const rows = [];
  for (let id = 1; id <= 344; id++) rows.push(row(id, seeded(), seeded()));
  return rows;
}

test("all 344 baseline receipts classify every field without leaking source text", () => {
  const rows = cohort();
  const a = seeded(), b = seeded();
  a.intro = "Notion"; b.intro = "Admin";
  rows[0] = row(1, a, b);
  const c = seeded(), d = seeded();
  c.history = "Notion-only"; d.history = "";
  c.image = ""; d.image = "https://example.org/dog.jpg";
  rows[1] = row(2, c, d);
  const e = seeded(), f = seeded();
  e["fciStandard.oci"] = "FCI eye description";
  f["fciStandard.oci"] = "";
  e.intro = null; f.intro = "";
  rows[2] = row(3, e, f);
  const report = summarizeBreedWorkcopyBaselineDifferences(rows, BREED_NOTION_PRIORITY_FIELDS);
  assert.equal(report.records, 344);
  assert.equal(report.comparedCells, 344 * fieldIds.length);
  assert.equal(report.differingCells, 5);
  assert.equal(report.recordsWithDifferences, 3);
  assert.equal(report.excludedFromNormalSyncDifferences, 1);
  const byId = Object.fromEntries(report.byField.map(x => [x.fieldId, x]));
  assert.equal(byId.intro.differingProfiles, 2);
  assert.equal(byId.intro.differentNonempty, 1);
  assert.equal(byId.intro.blankRepresentationOnly, 1);
  assert.equal(byId.history.notionOnly, 1);
  assert.equal(byId.image.adminOnly, 1);
  assert.equal(byId.image.excludedFromNormalWorkcopySync, true);
  assert.equal(byId["fciStandard.oci"].notionOnly, 1);
  const safeJson = JSON.stringify(report);
  assert(!safeJson.includes("Notion-only"));
  assert(!safeJson.includes("FCI eye description"));
  assert(!safeJson.includes("https://example.org/dog.jpg"));
  assert.equal(report.canAuthorizeProductionWrites, false);
});

test("invalid, duplicate or partial receipt cannot become an accepted diagnosis", () => {
  for (const change of [
    rows => rows.pop(),
    rows => { rows[0].breed_id = rows[1].breed_id; },
    rows => { rows[0].work_sync_receipt = "broken"; },
    rows => { rows[0].status = "ACTIVE"; },
    rows => {
      const data = JSON.parse(rows[0].work_sync_receipt.slice("breed-field-v1:".length));
      const notion = JSON.parse(data.notion);
      delete notion.intro;
      data.notion = JSON.stringify(notion);
      rows[0].work_sync_receipt = "breed-field-v1:" + JSON.stringify(data);
    },
  ]) {
    const rows = cohort(); change(rows);
    assert.throws(
      () => summarizeBreedWorkcopyBaselineDifferences(rows, BREED_NOTION_PRIORITY_FIELDS),
      /BREED_DIFF_/,
    );
  }
});

const notionText = (id, value) => ({
  id, type: "rich_text", rich_text: [{ plain_text: value }],
});
test("isolated Notion → Admin dry-run targets only the signed nonempty changed field", () => {
  const page = {
    last_edited_time: "2026-11-08T20:30:00.000Z",
    properties: {
      "Intro": notionText("edit-intro", "Nové intro"),
      "História": notionText("edit-history", "Nedotknutá história"),
      "FCI číslo": { id: "system-fci", type: "number", number: 122 },
    },
  };
  const allowed = workCopyChangedEditorialIds(
    page, ["edit-intro"], BREED_NOTION_PRIORITY_FIELDS,
  );
  assert.deepEqual(allowed, ["intro"]);
  const selected = workCopyNonblankChangedFields({
    allowed, changed: ["intro"],
    accepted: ["intro"], values: { intro: "Nové intro" },
  });
  assert.deepEqual(selected, ["intro"]);
  assert.deepEqual(workCopyChangedEditorialIds(
    page, ["system-fci"], BREED_NOTION_PRIORITY_FIELDS,
  ), []);
  assert.deepEqual(workCopyNonblankChangedFields({
    allowed, changed: ["intro"], accepted: ["intro"], values: { intro: " " },
  }), []);
});

test("isolated Admin → Notion dry-run patches one exact property, not old conflicting fields", () => {
  const before = { intro: "Pôvodné intro", history: "Admin historický text", image: "old.jpg" };
  const after = { ...before, intro: "Nový krátky úvod" };
  const chosen = workCopyAdminChangedFields(
    before, after, ["intro", "history", "image"], ["intro", "history"],
  );
  assert.deepEqual(chosen, ["intro"]);
  const page = {
    last_edited_time: "2026-11-08T20:30:00.000Z",
    properties: {
      Intro: notionText("id-intro", "Notion historické intro"),
      História: notionText("id-history", "Iný historický obsah"),
    },
  };
  const planned = planBreedWorkCopyFieldWrite({
    schema: BREED_NOTION_PRIORITY_FIELDS,
    page, fieldId: "intro", value: after.intro,
    baseline: "Notion historické intro",
    expectedPageRevision: page.last_edited_time,
  });
  assert.equal(planned.changed, true);
  assert.deepEqual(Object.keys(planned.properties), ["Intro"]);
  assert.equal(planned.properties.Intro.rich_text[0].text.content, "Nový krátky úvod");
  assert.throws(() => planBreedWorkCopyFieldWrite({
    schema: BREED_NOTION_PRIORITY_FIELDS, page, fieldId: "intro",
    value: after.intro, baseline: "V Notione už medzitým zmenené",
    expectedPageRevision: page.last_edited_time,
  }), /BREED_WORKCOPY_FIELD_CHANGED_IN_NOTION/);
  assert.throws(() => planBreedWorkCopyFieldWrite({
    schema: BREED_NOTION_PRIORITY_FIELDS, page, fieldId: "intro",
    value: after.intro, baseline: "Notion historické intro",
    expectedPageRevision: "old-revision",
  }), /BREED_WORKCOPY_PAGE_REVISION_CHANGED/);
});

test("production remains old-only and test never enables new sync or writes Notion", () => {
  const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");
  const vars = JSON.parse(read("wrangler.jsonc")).vars;
  const runtime = read("lib/notion-breed-workcopy-sync.ts");
  const postflight = read("scripts/production-breed-workcopy-postflight.mjs");
  assert.equal(vars.NOTION_BREED_SYNC_ENABLED, "false");
  assert.equal(vars.NOTION_BREED_WORKCOPY_SYNC_ENABLED, "false");
  assert.equal(vars.NOTION_BREED_WORKCOPY_ACTIVATE_ENABLED, "true");
  assert.equal(vars.NOTION_BREED_WORKCOPY_BASELINE_ENABLED, "false");
  assert.match(runtime, /BREED_DUAL_SYNCHRONIZERS_FORBIDDEN/);
  assert.match(runtime, /BREED_WORKCOPY_COHORT_NOT_ACTIVE/);
  assert.match(runtime, /targetPageId/);
  assert.match(runtime, /changedPropertyIds/);
  assert.match(postflight, /summarizeBreedWorkcopyBaselineDifferences/);
  assert.doesNotMatch(postflight, /method: "PATCH"|method: "PUT"|method: "DELETE"/);
});
