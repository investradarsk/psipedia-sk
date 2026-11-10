import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  LOST_FOUND_SHORT_DESCRIPTION_FIELD,
  withoutLostFoundShortDescription,
  extendLostFoundShortDescriptionBaseline,
} from "../lib/notion-lost-found-short-description.ts";
import { reconcileProfileFields } from "../lib/notion-profile-field-reconciliation.ts";
import { agendaEditableFields } from "../lib/notion-events-help-adapters.ts";
import { loadNotionBulkLostFound } from "../lib/notion-bulk-sources.ts";
import { stableAgendaSnapshotJson } from "../lib/notion-bidirectional-reconciliation.ts";

const source = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const merge = ({ baseline, notion, psipedia }) => reconcileProfileFields({
  baseline, notion, psipedia,
  protectedFields: new Set(),
  canonicalFieldsWin: true,
  equalField: (key, left, right) => stableAgendaSnapshotJson("lost-found", { [key]: left })
    === stableAgendaSnapshotJson("lost-found", { [key]: right }),
});

test("0158–0162: single Notion field is independently editable alongside long Popis", () => {
  assert.equal(agendaEditableFields["lost-found"].filter((field) => field === LOST_FOUND_SHORT_DESCRIPTION_FIELD).length, 1);
  assert.ok(agendaEditableFields["lost-found"].includes("Popis"));
  const adapter = source("lib/notion-events-help-adapters.ts");
  assert.match(adapter, /shortDescription:\s*s\(values\["Krátky popis"\]\)/);
  assert.match(source("components/admin-lost-found-editor.tsx"), /shortDescription:state\.shortDescription/);
  assert.match(source("db/lost-found-dogs-schema.ts"), /shortDescription: text\("short_description"\)\.notNull\(\)\.default\(""\)/);
  assert.match(source("lib/lost-found-dog-store.ts"), /short_description=\?/);
  assert.match(source("components/lost-found-dog-detail.tsx"), /report\.shortDescription/);
});

test("verified legacy snapshot is extended without replacing long description", () => {
  const old = { Slug: "test-pes", Popis: "Dlhý opis psa", Mesto: "Nitra" };
  const previous = withoutLostFoundShortDescription({ ...old, "Krátky popis": "Novinka" });
  assert.deepEqual(previous, old);
  const baseline = extendLostFoundShortDescriptionBaseline(previous);
  assert.equal(baseline["Krátky popis"], "");
  assert.equal(baseline.Popis, old.Popis);
  assert.deepEqual(old, previous);
});

test("Notion short description imports to Admin without touching long description", () => {
  const baseline = { Slug: "pes", Popis: "Pôvodný dlhý text", "Krátky popis": "" };
  const actual = merge({
    baseline,
    notion: { ...baseline, "Krátky popis": "Pes bol nájdený pri parku" },
    psipedia: baseline,
  });
  assert.equal(actual.kind, "MERGE");
  assert.equal(actual.merged["Krátky popis"], "Pes bol nájdený pri parku");
  assert.equal(actual.merged.Popis, "Pôvodný dlhý text");
});

test("Admin short description exports to Notion without touching long description", () => {
  const baseline = { Slug: "pes", Popis: "Pôvodný dlhý text", "Krátky popis": "" };
  const actual = merge({
    baseline,
    notion: baseline,
    psipedia: { ...baseline, "Krátky popis": "Nový stručný opis" },
  });
  assert.equal(actual.kind, "MERGE");
  assert.equal(actual.merged["Krátky popis"], "Nový stručný opis");
  assert.equal(actual.merged.Popis, "Pôvodný dlhý text");
});

test("distinct concurrent edits to same short-description field remain conflict, not overwrite", () => {
  const baseline = { Slug: "pes", Popis: "Dlhý text", "Krátky popis": "" };
  const actual = merge({
    baseline,
    notion: { ...baseline, "Krátky popis": "Notion úprava" },
    psipedia: { ...baseline, "Krátky popis": "Admin úprava" },
  });
  assert.equal(actual.kind, "CONFLICT");
  assert.equal(actual.merged["Krátky popis"], "Admin úprava");
  assert.equal(actual.merged.Popis, baseline.Popis);
});

test("Lost/Found canonical export actually selects both descriptions", async () => {
  let sql = "";
  const db = {
    prepare(statement) {
      sql = statement;
      return {
        bind() { return this; },
        async all() {
          return { results: [{
            id: 5, type: "LOST", status: "ACTIVE", slug: "strateny-pes", dog_name: "Foxy",
            city: "Gbely", description: "Podrobný opis", short_description: "Stratil sa v centre",
          }] };
        },
      };
    },
  };
  const rows = await loadNotionBulkLostFound(db, 5);
  assert.match(sql, /short_description,description/);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].properties["Krátky popis"], "Stratil sa v centre");
  assert.equal(rows[0].properties["Popis"], "Podrobný opis");
});

test("reconciliation fallback is restricted to previously verifiable hash snapshots", () => {
  const sync = source("lib/notion-events-help-sync.ts");
  assert.match(sync, /withoutLostFoundShortDescription\(notionSnapshot\)/);
  assert.match(sync, /withoutLostFoundShortDescription\(sourceSnapshot\)/);
  assert.match(sync, /await snapshotHash\("lost-found", oldNotion\) === mapping\.content_hash/);
  assert.match(sync, /await snapshotHash\("lost-found", oldAdmin\) === mapping\.content_hash/);
  assert.doesNotMatch(source("drizzle/0162_lost_found_short_description.sql"), /\b(?:DROP|DELETE|UPDATE)\s/);
});
