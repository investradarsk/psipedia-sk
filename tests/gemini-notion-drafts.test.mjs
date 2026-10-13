import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getGeminiDirectoryDraft, listGeminiDirectoryDrafts,
  approveGeminiDirectoryDraft, saveGeminiDirectoryDraft, reviewGeminiDirectoryDraft, GeminiNotionReviewError,
  GEMINI_NOTION_CREATOR,
} from "../lib/gemini-notion-directory-review.ts";

const ds = "84e0664c-ca47-405f-9d54-31b20287bc8c";
const id = "3f7793fc-1d18-81d8-a586-e7afb66972b4";
const locks = new Set();
const DB = { prepare(sql) { return { bind(id) { return {
  async first() { return null; },
  async all() { return { results: [] }; },
  async run() {
    if (sql.startsWith("INSERT")) { const changes = locks.has(id) ? 0 : 1; locks.add(id); return { meta: { changes } }; }
    if (sql.startsWith("DELETE")) { locks.delete(id); return { meta: { changes: 1 } }; }
    throw Error("Unexpected D1 write: " + sql);
  },
}; } }; } };
const schema = { properties: {
  "Stav": { type: "select", select: { options: ["Na kontrolu", "Publikované", "Archív"].map(name => ({ name })) } },
  "Psipedia stav": { type: "select", select: { options: ["Koncept", "Publikované", "Archív"].map(name => ({ name })) } },
  "Poznámky": { type: "rich_text" }, "Upravil": { type: "rich_text" },
} };
const isSchema = url => String(url).includes("/data_sources/") && !String(url).endsWith("/query");
const env = { DB, NOTION_API_TOKEN: "test-token", NOTION_DIRECTORY_DATA_SOURCE_ID: ds };
const text = (value) => ({ type: "rich_text", rich_text: [{ plain_text: value }] });
const select = (value) => ({ type: "select", select: { name: value } });
function page(overrides = {}) {
  return {
    id, url: "https://www.notion.so/" + id.replaceAll("-", ""),
    parent: { type: "data_source_id", data_source_id: ds },
    created_time: "2026-10-12T20:07:00Z",
    last_edited_time: "2026-10-12T20:44:28Z",
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
    assert.equal(drafts.length, 2);
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
    if (isSchema(url)) return json(schema);
    calls.push({ url, init });
    if (!init.method) return json(page());
    if (init.method === "PATCH") return json(page({
      "Stav": select("Publikované"), "Psipedia stav": select("Publikované"),
    }));
    throw Error("Unexpected Notion request");
  };
  try {
    const result = await approveGeminiDirectoryDraft(env, id, "2026-10-12T20:44:28Z", "admin@test.sk");
    assert.deepEqual(result, { status: "PENDING_SYNC" });
    assert.equal(calls.length, 3);
    const data = JSON.parse(calls.find(call => call.init.method === "PATCH").init.body);
    assert.deepEqual(Object.keys(data.properties).sort(), ["Psipedia stav", "Stav", "Poznámky", "Upravil"].sort());
    assert.equal(data.properties.Stav.select.name, "Publikované");
    assert.equal(data.properties["Psipedia stav"].select.name, "Publikované");
    assert.doesNotMatch(calls.find(call => call.init.method === "PATCH").init.body, /Notion API token|Psipedia ID/);
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
      await assert.rejects(approveGeminiDirectoryDraft(env, id, "2026-10-12T20:44:28Z", "admin@test.sk"),
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


const fullDraftInput = {
  lastEditedAt: "2026-10-12T20:44:28Z",
  name: "AmyVet – veterinárna klinika Sereď",
  slug: "amyvet-sered",
  category: "veterinari",
  excerpt: "Upravený krátky text",
  description: "Upravený obsah\\nDruhý odsek",
  services: ["Vakcinácia", "Chirurgia"],
  qualifications: ["MVDr."],
  region: "Trnavský kraj", district: "Galanta", city: "Sereď",
  address: "Starý Most 3075/13", postalCode: "926 01",
  street: "Starý Most", houseNumber: "3075/13", addressFormat: "STREET",
  priceNote: "", websiteUrl: "https://www.amyvet.sk",
  publicPhone: "+421 914 434 141", publicEmail: "info@amyvet.sk",
  facebookUrl: "", instagramUrl: "", internalEmail: "",
  imageUrl: "", imageKey: "", logoUrl: "https://www.amyvet.sk/logo.png",
  qualityResolutions: { phone: "", email: "", website: "", image: "", address: "" },
  verified: false, featured: false,
  seo: { title: "AmyVet", description: "Veterinárna klinika", focusKeyword: "veterinár Sereď",
    canonicalUrl: "", ogTitle: "", ogDescription: "", ogImage: "", noindex: false },
};

test("full directory editor saves Notion-only draft without changing publication or identity", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  let lastEditedTime = "2026-10-12T20:44:28Z";
  globalThis.fetch = async (url, init = {}) => {
    if (isSchema(url)) return json(schema);
    calls.push({ url: String(url), init });
    if (init.method === "PATCH") {
      lastEditedTime = "2026-10-12T23:20:00Z";
      return json(page());
    }
    return json({ ...page(), last_edited_time: lastEditedTime });
  };
  try {
    const result = await saveGeminiDirectoryDraft(env, id, fullDraftInput, "admin@test.sk");
    assert.equal(result.name, "AmyVet");
    assert.equal(result.lastEditedAt, "2026-10-12T23:20:00Z");
    assert.equal(calls.length, 4);
    assert.match(calls[2].url, new RegExp("/pages/" + id + "$"));
    const patch = JSON.parse(calls.find(call => call.init.method === "PATCH").init.body).properties;
    assert.equal(patch["Názov"].title[0].text.content, fullDraftInput.name);
    assert.equal(patch["E-mail"].email, "info@amyvet.sk");
    assert.equal(patch["Telefón"].phone_number, "+421 914 434 141");
    assert.equal(patch["Logo URL"].url, "https://www.amyvet.sk/logo.png");
    assert.equal(patch["Adresa"].rich_text[0].text.content, "Starý Most 3075/13");
    assert.equal(patch["SEO title"].rich_text[0].text.content, "AmyVet");
    assert.equal(patch["Služby"].rich_text[0].text.content, "Vakcinácia\nChirurgia");
    for (const forbidden of ["Stav", "Psipedia stav", "Psipedia ID", "Vytvoril", "Sync hash"]) {
      assert.ok(!(forbidden in patch), "Draft edit must not write " + forbidden);
    }
    assert.equal(result.psipediaStatus, "Koncept");
  } finally { globalThis.fetch = originalFetch; }
});

test("stale Notion drafts and foreign records cannot be modified", async () => {
  const originalFetch = globalThis.fetch;
  for (const props of [
    { "Vytvoril": text("Redaktor") },
    { "Psipedia ID": text("123") },
    { "Psipedia stav": select("Publikované") },
  ]) {
    let patches = 0;
    globalThis.fetch = async (_url, init = {}) => {
      if (init.method === "PATCH") patches++;
      return json(page(props));
    };
    try {
      await assert.rejects(saveGeminiDirectoryDraft(env, id, fullDraftInput, "admin@test.sk"),
        (error) => error instanceof GeminiNotionReviewError);
      assert.equal(patches, 0);
    } finally { globalThis.fetch = originalFetch; }
  }
  let patches = 0;
  globalThis.fetch = async (_url, init = {}) => {
    if (init.method === "PATCH") patches++;
    return json({ ...page(), last_edited_time: "2026-10-12T23:30:00Z" });
  };
  try {
    await assert.rejects(saveGeminiDirectoryDraft(env, id, fullDraftInput, "admin@test.sk"), { code: "CONFLICT" });
    assert.equal(patches, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("Gemini concept modal uses the existing directory editor and keeps publication deliberate", () => {
  const list = readFileSync(new URL("../components/admin-gemini-notion-drafts.tsx", import.meta.url), "utf8");
  const editor = readFileSync(new URL("../components/admin-directory-editor.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/admin/gemini-automation/notion-drafts/[id]/route.ts", import.meta.url), "utf8");
  assert.match(list, /<AdminModalDialog/);
  assert.match(list, /<AdminDirectoryEditor/);
  assert.match(editor, /if \(notionDraft && !publishConfirming\)/);
  assert.match(editor, /method: "PUT"/);
  assert.match(route, /requireAdminMutation\(request\)/);
});

test("reject/restore lifecycle preserves notes and original identity; repeat rejection does not write", async () => {
  const previous = globalThis.fetch;
  let current = page({ "Poznámky": text("Pôvodná poznámka") });
  let writes = 0;
  globalThis.fetch = async (url, init = {}) => {
    if (isSchema(url)) return json(schema);
    if (init.method === "PATCH") {
      writes++;
      const props = JSON.parse(init.body).properties;
      assert.deepEqual(Object.keys(props).sort(), ["Stav", "Psipedia stav", "Poznámky", "Upravil"].sort());
      for (const [key, value] of Object.entries(props)) {
        current.properties[key] = value.rich_text ? text(value.rich_text.map(item => item.text.content).join("")) : value;
      }
      current.last_edited_time = `revision-${writes}`;
    }
    return json(current);
  };
  try {
    const rejected = await reviewGeminiDirectoryDraft(env, id, { action: "reject", lastEditedAt: current.last_edited_time, reason: "Nerelevantný subjekt" }, "admin@test.sk");
    assert.equal(rejected.reviewState, "REJECTED");
    assert.equal(rejected.rejectionReason, "Nerelevantný subjekt");
    assert.equal(rejected.psipediaId, "");
    assert.match(rejected.notes, /^Pôvodná poznámka\n/);
    assert.match(rejected.notes, /AmyVet/);
    assert.equal(writes, 1);
    await reviewGeminiDirectoryDraft(env, id, { action: "reject", lastEditedAt: "stale" }, "admin@test.sk");
    assert.equal(writes, 1);
    await assert.rejects(approveGeminiDirectoryDraft(env, id, rejected.lastEditedAt, "admin@test.sk"), { code: "STATE" });
    await assert.rejects(saveGeminiDirectoryDraft(env, id, { ...fullDraftInput, lastEditedAt: rejected.lastEditedAt }, "admin@test.sk"), { code: "STATE" });
    const restored = await reviewGeminiDirectoryDraft(env, id, { action: "restore", lastEditedAt: rejected.lastEditedAt }, "admin@test.sk");
    assert.equal(restored.reviewState, "IN_PROGRESS");
    assert.equal(restored.psipediaStatus, "Koncept");
    assert.equal(writes, 2);
    assert.match(restored.notes, /Nerelevantný subjekt/);
  } finally { globalThis.fetch = previous; locks.clear(); }
});

test("simultaneous review writes serialize across requests; stale revision cannot overwrite", async () => {
  const previous = globalThis.fetch;
  let unblock;
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { unblock = resolve; });
  globalThis.fetch = async (url, init = {}) => {
    if (isSchema(url)) return json(schema);
    if (init.method === "PATCH") { entered(); await gate; }
    return json(page());
  };
  try {
    const first = reviewGeminiDirectoryDraft(env, id, { action: "reject", lastEditedAt: fullDraftInput.lastEditedAt }, "admin@test.sk");
    await started;
    await assert.rejects(approveGeminiDirectoryDraft(env, id, fullDraftInput.lastEditedAt, "admin@test.sk"), { code: "LOCKED" });
    unblock(); await first;
    assert.equal(locks.size, 0);
  } finally { globalThis.fetch = previous; locks.clear(); }
});

test("unknown schema refuses writes and uncertain PATCH retains durable exclusion", async () => {
  const previous = globalThis.fetch;
  let writes = 0;
  globalThis.fetch = async (url, init = {}) => {
    if (isSchema(url)) return json({ properties: {} });
    if (init.method === "PATCH") writes++;
    return json(page());
  };
  try {
    await assert.rejects(reviewGeminiDirectoryDraft(env, id, { action: "reject", lastEditedAt: fullDraftInput.lastEditedAt }, "admin@test.sk"), { code: "CONFIG" });
    assert.equal(writes, 0); assert.equal(locks.size, 0);
    globalThis.fetch = async (url, init = {}) => {
      if (isSchema(url)) return json(schema);
      if (init.method === "PATCH") { writes++; throw Error("lost response"); }
      return json(page());
    };
    await assert.rejects(reviewGeminiDirectoryDraft(env, id, { action: "reject", lastEditedAt: fullDraftInput.lastEditedAt }, "admin@test.sk"));
    assert.equal(writes, 1); assert.equal(locks.size, 1);
  } finally { globalThis.fetch = previous; locks.clear(); }
});

test("pending approval can be rejected under the page lock; mapped published profiles cannot", async () => {
  const previous = globalThis.fetch;
  let patches = 0;
  globalThis.fetch = async (url, init = {}) => {
    if (isSchema(url)) return json(schema);
    if (init.method === "PATCH") patches++;
    return json(page({ "Stav": select("Publikované"), "Psipedia stav": select("Publikované") }));
  };
  try {
    await reviewGeminiDirectoryDraft(env, id, { action: "reject", lastEditedAt: fullDraftInput.lastEditedAt }, "admin@test.sk");
    assert.equal(patches, 1);
    const mappedEnv = { ...env, DB: { prepare(sql) {
      const query = DB.prepare(sql);
      if (!sql.includes('SELECT')) return query;
      return { bind() { return { async all() { return { results: [{ notion_page_id: id, id: 123, status: 'published' }] }; } }; } };
    } } };
    const mapped = await getGeminiDirectoryDraft(mappedEnv, id);
    assert.equal(mapped.reviewState, 'PUBLISHED');
    await assert.rejects(reviewGeminiDirectoryDraft(mappedEnv, id, { action: 'reject', lastEditedAt: fullDraftInput.lastEditedAt }, 'admin@test.sk'), { code: 'STATE' });
    assert.equal(patches, 1);
  } finally { globalThis.fetch = previous; locks.clear(); }
});
