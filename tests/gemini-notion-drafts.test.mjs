import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getGeminiDirectoryDraft, listGeminiDirectoryDrafts,
  approveGeminiDirectoryDraft, GeminiNotionReviewError,
  GEMINI_NOTION_CREATOR,
} from "../lib/gemini-notion-directory-review.ts";

const ds = "84e0664c-ca47-405f-9d54-31b20287bc8c";
const id = "3f7793fc-1d18-81d8-a586-e7afb66972b4";
const env = { NOTION_API_TOKEN: "test-token", NOTION_DIRECTORY_DATA_SOURCE_ID: ds };
const text = (value) => ({ type: "rich_text", rich_text: [{ plain_text: value }] });
const select = (value) => ({ type: "select", select: { name: value } });
function page(overrides = {}) {
  return {
    id, url: "https://www.notion.so/" + id.replaceAll("-", ""),
    parent: { type: "data_source_id", data_source_id: ds },
    created_time: "2026-10-12T20:07:00Z",
    properties: {
      "Názov": { type: "title", title: [{ plain_text: "AmyVet" }] },
      "Kategória": text("veterinari"),
      "Mesto": text("Sereď"),
      "Vytvoril": text(GEMINI_NOTION_CREATOR),
      "Psipedia ID": text(""),
      "Psipedia stav": select("Koncept"),
      "Stav": select("Na kontrolu"),
      "Web": { type: "url", url: "https://amyvet.sk" },
      "Zdroj dát": { type: "url", url: "https://amyvet.sk" },
      "Telefón": { type: "phone_number", phone_number: "+421 914 434 141" },
      "E-mail": { type: "email", email: "info@amyvet.sk" },
      ...overrides,
    },
  };
}
const json = (data) => new Response(JSON.stringify(data), {
  status: 200, headers: { "content-type": "application/json" },
});

test("admin category list queries Notion directly, not D1, and excludes unrelated drafts", async () => {
  const originalFetch = globalThis.fetch;
  let count = 0;
  globalThis.fetch = async (url, init) => {
    count++;
    assert.match(String(url), /\/data_sources\/.*\/query/);
    assert.equal(init.method, "POST");
    assert.equal(init.headers.get("Authorization"), "Bearer test-token");
    const q = JSON.parse(init.body);
    assert.deepEqual(q.filter.and, [
      { property: "Vytvoril", rich_text: { equals: GEMINI_NOTION_CREATOR } },
      { property: "Kategória", rich_text: { equals: "veterinari" } },
    ]);
    return json({ results: [page(), page({ "Vytvoril": text("Iný redaktor") }),
      page({ "Psipedia stav": select("Publikované") })], has_more: false });
  };
  try {
    const drafts = await listGeminiDirectoryDrafts(env, "directory.veterinari");
    assert.equal(count, 1);
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0].name, "AmyVet");
    assert.equal(drafts[0].email, "info@amyvet.sk");
    assert.equal(drafts[0].phone, "+421 914 434 141");
    assert.equal(drafts[0].psipediaStatus, "Koncept");
  } finally { globalThis.fetch = originalFetch; }
});

test("explicit publication only changes editorial fields after reviewing an attributed draft", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    if (!init.method) return json(page());
    if (init.method === "PATCH") return json(page({
      "Stav": select("Publikované"), "Psipedia stav": select("Publikované"),
    }));
    throw Error("Unexpected Notion request");
  };
  try {
    const result = await approveGeminiDirectoryDraft(env, id);
    assert.deepEqual(result, { status: "PENDING_SYNC" });
    assert.equal(calls.length, 2);
    const data = JSON.parse(calls[1].init.body);
    assert.deepEqual(Object.keys(data.properties).sort(), ["Psipedia stav", "Stav"].sort());
    assert.equal(data.properties.Stav.select.name, "Publikované");
    assert.equal(data.properties["Psipedia stav"].select.name, "Publikované");
    assert.doesNotMatch(calls[1].init.body, /Notion API token|Psipedia ID/);
  } finally { globalThis.fetch = originalFetch; }
});

test("review rejects non-agent, already synced, or already published records", async () => {
  const originalFetch = globalThis.fetch;
  for (const properties of [
    { "Vytvoril": text("Redaktor") },
    { "Psipedia ID": text("123") },
    { "Stav": select("Publikované") },
  ]) {
    let post = 0;
    globalThis.fetch = async (url, init) => {
      if (init.method === "PATCH") post++;
      return json(page(properties));
    };
    try {
      await assert.rejects(approveGeminiDirectoryDraft(env, id),
        (error) => error instanceof GeminiNotionReviewError);
      assert.equal(post, 0);
    } finally { globalThis.fetch = originalFetch; }
  }
  await assert.rejects(getGeminiDirectoryDraft(env, "../secrets"), {
    code: "ID",
  });
});

test("only directory catalog keys are valid and new worker tags its drafts", async () => {
  const source = readFileSync(new URL("../scripts/gemini-notion-agent.mjs", import.meta.url), "utf8");
  assert.match(source, /"Vytvoril": "Gemini automatizácia"/);
  await assert.rejects(listGeminiDirectoryDrafts(env, "events.vystavy"),
    (error) => error instanceof GeminiNotionReviewError && error.code === "CATEGORY");
  const screen = readFileSync(new URL("../components/admin-gemini-automation-settings.tsx", import.meta.url), "utf8");
  assert.match(screen, /<AdminGeminiNotionDrafts stableKey=\{setting.stableKey\}/);
  const sync = readFileSync(new URL("../lib/notion-directory-sync.ts", import.meta.url), "utf8");
  assert.match(sync, /status: desired\.status === "published" \? "published" : "draft"/);
});
