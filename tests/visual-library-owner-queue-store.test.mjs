import assert from "node:assert/strict";
import { test } from "node:test";
import { env } from "cloudflare:workers";
import {
  getOwnerDecision, listOwnerDecisions, saveOwnerDecision,
} from "../lib/visual-library-owner-decision-store.ts";

const draft = {
  leftId: "magazine",
  rightId: "context",
  leftTitle: "Banner Veterinári",
  rightTitle: "Informačný banner",
  leftVariantId: "clanky:veterinari",
  rightVariantId: "context-photo",
  decision: "use-left",
  notes: "Zachovať A",
};

function fakeDB() {
  const rows = new Map();
  const seen = [];
  return {
    rows, seen,
    prepare(sql) {
      seen.push(sql);
      return {
        bind(...values) {
          return {
            async first() {
              assert.match(sql, /SELECT banner_id,revision/);
              return rows.get(values[0]) ?? null;
            },
            async all() {
              const [pattern, limit, offset] = values;
              const prefix = String(pattern).replace(/%$/, "");
              const selected = [...rows.values()].filter((row) => row.banner_id.startsWith(prefix))
                .sort((a,b) => b.updated_at.localeCompare(a.updated_at) || a.banner_id.localeCompare(b.banner_id));
              return { results: selected.slice(offset, offset + limit) };
            },
            async run() {
              if (sql.includes("INSERT INTO")) {
                const [key, serialized, time, actor] = values;
                if (rows.has(key)) return { meta: { changes: 0 } };
                rows.set(key, {
                  banner_id: key, revision: 1,
                  draft_json: serialized, updated_at: time, updated_by: actor,
                });
                return { meta: { changes: 1 } };
              }
              if (sql.includes("UPDATE")) {
                const [serialized, time, actor, key, expected] = values;
                const row = rows.get(key);
                if (!row || row.revision !== expected) return { meta: { changes: 0 } };
                rows.set(key, {
                  ...row, draft_json: serialized,
                  revision: row.revision + 1, updated_at: time, updated_by: actor,
                });
                return { meta: { changes: 1 } };
              }
              throw new Error("Unexpected query " + sql);
            },
          };
        },
      };
    },
  };
}

test("D1 stores one revisioned, canonical review record, with optimistic conflicts", async () => {
  const old = env.DB;
  const db = fakeDB();
  env.DB = db;
  try {
    const first = await saveOwnerDecision({ draft, revision: 0, updatedBy: "owner@example.org" });
    assert.equal(first.revision, 1);
    assert.equal(first.draft.decision, "use-left");
    assert.match(first.key, /^owner-decision:/);
    assert.equal(db.rows.size, 1);
    const fromReverse = await getOwnerDecision(draft.rightId, draft.leftId);
    assert.equal(fromReverse.key, first.key);

    await assert.rejects(
      saveOwnerDecision({ draft, revision: 0, updatedBy: "owner@example.org" }),
      /KONFLIKT_VERZIE/,
    );
    const second = await saveOwnerDecision({
      draft: { ...draft, notes: "Nové rozhodnutie", decision: "use-right" },
      revision: 1, updatedBy: "owner@example.org",
    });
    assert.equal(second.revision, 2);
    assert.equal(second.draft.decision, "use-right");
    await assert.rejects(
      saveOwnerDecision({ draft, revision: 1, updatedBy: "owner@example.org" }),
      /KONFLIKT_VERZIE/,
    );

    const found = await listOwnerDecisions({ limit: 25, offset: 0 });
    assert.equal(found.items.length, 1);
    assert.equal(found.items[0].revision, 2);
    assert.equal(found.nextOffset, null);
    assert.ok(db.seen.every((sql) => sql.includes("visual_library_banner_edits")));
    assert.ok(db.seen.every((sql) => !/\bDELETE\b/.test(sql)));
  } finally {
    env.DB = old;
  }
});

test("owner review list is bounded, paginated and rejects an unavailable database", async () => {
  const old = env.DB;
  env.DB = undefined;
  try {
    await assert.rejects(listOwnerDecisions(), /Databáza nie je dostupná/);
    await assert.rejects(saveOwnerDecision({draft,revision:0,updatedBy:"owner@example.org"}), /Databáza nie je dostupná/);
  } finally { env.DB = old; }

  await assert.rejects(listOwnerDecisions({ limit: 51 }), /Neplatné stránkovanie/);
  await assert.rejects(listOwnerDecisions({ offset: -1 }), /Neplatné stránkovanie/);
  await assert.rejects(saveOwnerDecision({ draft, revision: -1, updatedBy: "owner@example.org" }), /Neplatná verzia/);
});
