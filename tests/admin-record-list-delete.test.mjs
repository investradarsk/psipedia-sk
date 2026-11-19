import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  removeAdminRecordFromList,
  adminListRemovalMessage,
} from "../lib/admin-record-list-delete.ts";

const preview = {
  id: 27,
  name: "Skutočný názov",
  slug: "skutocny-nazov",
  category: "novinky",
  notionLinked: true,
  notionPages: 1,
};
const success = { state: "COMPLETE", notionTrash: "confirmed" };
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
function fakeRequest(reply, calls) {
  return async (url, options = {}) => {
    calls.push({ url, options });
    return Response.json(
      options.method === "POST" ? reply : preview,
      { status: 200 },
    );
  };
}

test("list deletion first checks exact D1 identity, then uses lifecycle POST with confirmed Notion target", async () => {
  const calls = [];
  const result = await removeAdminRecordFromList(
    "articles", 27, preview.name, fakeRequest(success, calls),
  );
  assert.equal(result.state, "COMPLETE");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "/api/admin/record-lifecycle/articles/27");
  assert.equal(calls[0].options.method, undefined);
  assert.equal(calls[0].options.cache, "no-store");
  const sent = JSON.parse(calls[1].options.body);
  assert.deepEqual(sent, {
    action: "delete",
    confirmed: true,
    localOnly: false,
    expectedSlug: preview.slug,
    expectedName: preview.name,
    expectedCategory: preview.category,
  });
  assert.equal(calls[1].options.credentials, "same-origin");
});

test("unlinked record receives explicit local-only confirmation, no guessed Notion page", async () => {
  const calls = [];
  await removeAdminRecordFromList(
    "help", 27, preview.name,
    async (url, options = {}) => {
      calls.push({ url, options });
      return Response.json(options.method === "POST" ? success : {
        ...preview, notionLinked: false,
      });
    },
  );
  assert.equal(JSON.parse(calls[1].options.body).localOnly, true);
});

test("stale listing name or numeric ID cannot delete a changed record", async () => {
  for (const expected of ["Zastaralý názov", "Skutočný názov"]) {
    const calls = [];
    const request = async (url, options = {}) => {
      calls.push({ url, options });
      return Response.json(expected === preview.name ? { ...preview, id: 28 } : preview);
    };
    await assert.rejects(
      removeAdminRecordFromList("breeds", 27, expected, request),
      /medzitým zmenil/,
    );
    assert.equal(calls.length, 1);
  }
});

test("API failures and incomplete states never announce completed deletion", async () => {
  await assert.rejects(
    removeAdminRecordFromList("events", 27, preview.name,
      async () => Response.json({ error: "NOTION_MAPPING_INVALID" }, { status: 409 })),
    /NOTION_MAPPING_INVALID/,
  );
  const pending = await removeAdminRecordFromList("events", 27, preview.name,
    async (_url, options = {}) => Response.json(
      options.method === "POST"
        ? { state: "READY_LOCAL", errorCode: "D1_DELETE_BLOCKED_BY_REFERENCES" }
        : preview,
      { status: options.method === "POST" ? 202 : 200 },
    ),
  );
  assert.equal(pending.state, "READY_LOCAL");
  assert.match(adminListRemovalMessage(pending, "Podujatie"), /nie je dokončené/);
  assert.doesNotMatch(adminListRemovalMessage(pending, "Podujatie"), /bol natrvalo odstránený/);
  assert.match(adminListRemovalMessage({state:"COMPLETE"}, "Článok"), /natrvalo odstránený/);
});

test("legacy list delete buttons and directory permanent-delete action use the guarded lifecycle", () => {
  for (const [path, kind] of [
    ["components/admin-dashboard.tsx", "articles"],
    ["components/admin-breed-dashboard.tsx", "breeds"],
    ["components/admin-event-dashboard.tsx", "events"],
    ["components/admin-help-dashboard.tsx", "help"],
    ["components/admin-directory-dashboard.tsx", "directory"],
  ]) {
    const source = read(path);
    assert.match(source, new RegExp('removeAdminRecordFromList\\("' + kind + '",'));
    assert.match(source, /adminListRemovalMessage\(result,/);
    if (kind === "directory") {
      assert.match(source, /Archivovať<\/button>/);
      assert.match(source, />Odstrániť<\/button>/);
      assert.match(source, /Natrvalo odstrániť profil\?/);
    }
    assert.doesNotMatch(source, /fetch\(`\/api\/admin\/(?:articles|breeds|events|help)\/\$\{[^}]+\}`, \{ method: "DELETE" \}\)/);
  }
});
