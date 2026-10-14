import test from "node:test";
import assert from "node:assert/strict";
import { geminiAutomationCatalog } from "../lib/gemini-automation-catalog.ts";
import {
  geminiAgendaForKey, listGeminiAgendaDrafts, mutateGeminiAgendaDraft,
  GeminiAgendaReviewError,
} from "../lib/gemini-notion-agenda-review.ts";

const pageId = "11111111-1111-1111-1111-111111111111";
const sources = {
  events: "00000000-0000-0000-0000-000000000001",
  "help-cases": "00000000-0000-0000-0000-000000000002",
  organizations: "00000000-0000-0000-0000-000000000003",
  adoptions: "00000000-0000-0000-0000-000000000004",
  "lost-found": "3ed793fc-1d18-8122-95b9-000b05c3c6bd",
};
const rich = value => ({ type: "rich_text", rich_text: [{ plain_text: value }] });
const select = value => ({ type: "select", select: { name: value } });
const title = value => ({ type: "title", title: [{ plain_text: value }] });
const url = value => ({ type: "url", url: value });
const json = value => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
const eventValues = {
  vystavy: "Výstava", preteky: "Preteky", seminare: "Seminár",
  treningy: "Tréning", stretnutia: "Stretnutie", dalsie: "Iné",
};

function fixture(key) {
  const agenda = geminiAgendaForKey(key);
  assert.ok(agenda, "agenda must be known for non-directory");
  const ds = sources[agenda];
  const statusField = ["help-cases", "lost-found"].includes(agenda) ? "Psipedia stav" : "Stav";
  const status = agenda === "help-cases" ? rich("draft") : agenda === "lost-found" ? rich("DRAFT") : select("Nápad");
  const evidence = ["adoptions", "organizations"].includes(agenda) ? "Zdroje a dôkazy:" : "Dôkazy:";
  const nameField = agenda === "adoptions" ? "Meno" : "Názov";
  const value = { id: pageId, parent: { type: "data_source_id", data_source_id: ds },
    last_edited_time: "2026-10-14T20:00:00.000Z", properties: {
      [nameField]: title("Koncept A"),
      [statusField]: status,
      "Psipedia ID": rich(""),
      "Popis": rich("Overený opis subjektu.\n\n" + evidence + "\nname: https://source.example/dog"),
      "Mesto": rich("Nitra"), "Slug": rich("koncept-a"),
      "Krátky popis": rich("Doložený krátky popis"),
      "Verejný kontakt": rich(""),
      "Miesto": rich(""),
      "Latitude": { type: "number", number: null },
      "Longitude": { type: "number", number: null },
      "Presnosť lokality": rich(""),
      "Zdroj dát": url("https://source.example/dog"),
      "Začiatok": { type: "date", date: { start: "2026-10-22" } },
      "Typ podujatia": rich(eventValues[key.split(".")[1]] ?? ""),
      "Kategória": rich(key.split(".")[1]),
      "Web": url("https://source.example/dog"),
    },
  };
  const schema = { id: ds, parent: { database_id: "811d0659-7217-4914-a27c-1cd67bda3e0e" }, properties: Object.fromEntries(Object.entries(value.properties)
    .map(([name, prop]) => [name, {
      type: prop.type,
      ...(prop.type === "select" ? { select: { options: ["Nápad", "Na kontrolu", "Ready", "Archív"].map(name => ({ name })) } } : {}),
    }])) };
  const locks = new Set();
  const writes = [];
  const db = { prepare(sql) { return { bind(...params) { return {
    async first() { return sql.includes("notion_agenda_targets") ? { data_source_id: sources[params[0]] } : null; },
    async run() {
      if (sql.startsWith("INSERT OR IGNORE")) {
        const n = locks.has(params[0]) ? 0 : 1; locks.add(params[0]);
        return { meta: { changes: n } };
      }
      if (sql.startsWith("DELETE")) { locks.delete(params[0]); return { meta: { changes: 1 } }; }
      throw Error("Unexpected D1 write " + sql);
    },
  }; } }; } };
  const env = { DB: db, NOTION_API_TOKEN: "mock-only",
    NOTION_EVENTS_DATA_SOURCE_ID: sources.events,
    NOTION_HELP_DATA_SOURCE_ID: sources["help-cases"] };
  const request = async (resource, init = {}) => {
    const path = String(resource).replace("https://api.notion.com/v1", "");
    assert.equal(init.headers.get("Authorization"), "Bearer mock-only");
    if (path.startsWith("/data_sources/") && path.endsWith("/query")) {
      assert.equal(init.method, "POST");
      return json({ results: [value], has_more: false });
    }
    if (path.startsWith("/data_sources/")) return json(schema);
    if (path.startsWith("/pages/") && init.method === "PATCH") {
      const properties = JSON.parse(init.body).properties;
      writes.push(properties);
      for (const [name, patch] of Object.entries(properties)) {
        const before = value.properties[name] ?? {};
        const kind = Object.keys(patch)[0];
        const inner = patch[kind];
        value.properties[name] = { ...before, type: kind,
          [kind]: kind === "rich_text" || kind === "title"
            ? inner.map(chunk => ({ plain_text: chunk.text.content }))
            : inner };
      }
      value.last_edited_time = "2026-10-14T20:01:00.000Z";
      return json(value);
    }
    if (path.startsWith("/pages/")) return json(value);
    throw Error("Forbidden network endpoint " + path);
  };
  return { env, value, schema, writes, request };
}

async function mockedFetch(fn, runner) {
  const original = globalThis.fetch;
  globalThis.fetch = fn;
  try { await runner(); } finally { globalThis.fetch = original; }
}

test("catalog covers exactly 10 directory, 6 events and 6 help keys without new registry", () => {
  assert.equal(geminiAutomationCatalog.length, 22);
  assert.deepEqual(Object.fromEntries(["directory", "events", "help"].map(section =>
    [section, geminiAutomationCatalog.filter(item => item.section === section).length])),
    { directory: 10, events: 6, help: 6 });
  for (const item of geminiAutomationCatalog) {
    if (item.section === "directory") assert.equal(geminiAgendaForKey(item.stableKey), null);
    else assert.ok(geminiAgendaForKey(item.stableKey));
  }
  assert.equal(geminiAgendaForKey("help.invalid"), null);
});

test("all 12 event/help category lists load directly from the correct canonical Notion data source", async () => {
  for (const item of geminiAutomationCatalog.filter(item => item.section !== "directory")) {
    const f = fixture(item.stableKey);
    await mockedFetch(f.request, async () => {
      const results = await listGeminiAgendaDrafts(f.env, item.stableKey);
      assert.equal(results.length, 1, item.stableKey);
      assert.equal(results[0].stableKey, item.stableKey);
      assert.equal(results[0].psipediaId, "");
      assert.equal(results[0].reviewState, "NEW");
      assert.equal(results[0].notionUrl, "https://www.notion.so/" + pageId.replaceAll("-", ""));
    });
    assert.equal(f.writes.length, 0, "never writes during a listing");
  }
});

test("source evidence and category prevent unrelated Notion pages from appearing", async () => {
  const f = fixture("events.vystavy");
  await mockedFetch(f.request, async () => {
    f.value.properties["Popis"] = rich("Normal human Notion entry");
    assert.deepEqual(await listGeminiAgendaDrafts(f.env, "events.vystavy"), []);
    f.value.properties["Popis"] = rich("Text\nDôkazy:\nhttps://source.example");
    f.value.properties["Typ podujatia"] = rich("Preteky");
    assert.deepEqual(await listGeminiAgendaDrafts(f.env, "events.vystavy"), []);
    f.value.properties["Typ podujatia"] = rich("Výstava");
    f.value.parent.data_source_id = sources.adoptions;
    assert.deepEqual(await listGeminiAgendaDrafts(f.env, "events.vystavy"), []);
  });
});

test("save updates the same Notion page, keeps publication and evidence, and rejects stale revision", async () => {
  const f = fixture("events.vystavy");
  await mockedFetch(f.request, async () => {
    const entries = await listGeminiAgendaDrafts(f.env, "events.vystavy");
    const draft = entries[0];
    const next = await mutateGeminiAgendaDraft(f.env, draft.stableKey, draft.id, {
      action: "save", lastEditedAt: draft.lastEditedAt,
      fields: { "Názov": "Nový názov", Popis: "Opravený obsah.\n\nDôkazy:\nname: https://source.example/dog" },
    }, "admin@example.sk");
    assert.equal(next.name, "Nový názov");
    assert.equal(next.reviewState, "NEW");
    assert.equal(f.writes.length, 1);
    assert.equal(f.writes[0].Stav, undefined);
    assert.equal(f.writes[0]["Psipedia stav"], undefined);
    assert.equal(f.writes[0]["Psipedia ID"], undefined);
    assert.equal(f.writes[0]["Zdroj dát"], undefined);
    assert.equal(f.writes[0]["Popis"].rich_text[0].text.content,
      "Opravený obsah.\n\nDôkazy:\nname: https://source.example/dog");

    await assert.rejects(() => mutateGeminiAgendaDraft(f.env, draft.stableKey, draft.id, {
      action: "save", lastEditedAt: draft.lastEditedAt,
      fields: { "Názov": "prepísať" },
    }, "admin@example.sk"), { code: "CONFLICT" });
    await assert.rejects(() => mutateGeminiAgendaDraft(f.env, draft.stableKey, draft.id, {
      action: "save", lastEditedAt: next.lastEditedAt,
      fields: { Popis: "Opis bez zdrojového markeru" },
    }, "admin@example.sk"), { code: "STATE" });
    assert.equal(f.writes.length, 1);
  });
});

test("explicit approval and rejection have independent semantics and cannot write unexpected fields", async () => {
  const f = fixture("events.seminare");
  await mockedFetch(f.request, async () => {
    const draft = (await listGeminiAgendaDrafts(f.env, "events.seminare"))[0];
    await assert.rejects(() => mutateGeminiAgendaDraft(f.env, draft.stableKey, draft.id, {
      action: "approve", lastEditedAt: draft.lastEditedAt,
    }, "admin@example.sk"), { code: "STATE" });
    assert.equal(f.writes.length, 0);
    const approved = await mutateGeminiAgendaDraft(f.env, draft.stableKey, draft.id, {
      action: "approve", confirm: true, lastEditedAt: draft.lastEditedAt,
    }, "admin@example.sk");
    assert.equal(approved.reviewState, "APPROVED");
    assert.equal(f.writes[0].Stav.select.name, "Ready");
    assert.equal(Object.keys(f.writes[0]).length, 1);
  });
  const g = fixture("events.vystavy");
  await mockedFetch(g.request, async () => {
    const draft = (await listGeminiAgendaDrafts(g.env, "events.vystavy"))[0];
    const rejected = await mutateGeminiAgendaDraft(g.env, draft.stableKey, draft.id, {
      action: "reject", confirm: true, lastEditedAt: draft.lastEditedAt,
    }, "admin@example.sk");
    assert.equal(rejected.reviewState, "REJECTED");
    assert.equal(g.writes[0].Stav.select.name, "Archív");
    const restored = await mutateGeminiAgendaDraft(g.env, draft.stableKey, draft.id, {
      action: "restore", confirm: true, lastEditedAt: rejected.lastEditedAt,
    }, "admin@example.sk");
    assert.equal(restored.reviewState, "NEW");
    assert.equal(g.writes[1].Stav.select.name, "Na kontrolu");
  });
});

test("help-case approval and rejection fail closed: publication must not masquerade as review", async () => {
  const f = fixture("help.zbierky");
  await mockedFetch(f.request, async () => {
    const draft = (await listGeminiAgendaDrafts(f.env, "help.zbierky"))[0];
    await assert.rejects(() => mutateGeminiAgendaDraft(f.env, draft.stableKey, draft.id, {
      action: "reject", confirm: true, lastEditedAt: draft.lastEditedAt,
    }, "admin@example.sk"), error => error instanceof GeminiAgendaReviewError && error.code === "SCHEMA");
    await assert.rejects(() => mutateGeminiAgendaDraft(f.env, draft.stableKey, draft.id, {
      action: "approve", confirm: true, lastEditedAt: draft.lastEditedAt,
    }, "admin@example.sk"), error => error instanceof GeminiAgendaReviewError && error.code === "SCHEMA");
    assert.equal(f.writes.length, 0);
  });
});

test("adoption fields support edits without overwriting unchanged canonical fields", async () => {
  const f = fixture("help.adopcia");
  await mockedFetch(f.request, async () => {
    const draft = (await listGeminiAgendaDrafts(f.env, "help.adopcia"))[0];
    const next = await mutateGeminiAgendaDraft(f.env, draft.stableKey, draft.id, {
      action: "save", lastEditedAt: draft.lastEditedAt, fields: { "Krátky popis": "Bezpečný krátky text" },
    }, "admin@example.sk");
    assert.equal(next.reviewState, "NEW");
    assert.deepEqual(Object.keys(f.writes[0]), ["Krátky popis"]);
    assert.equal(f.writes[0]["Psipedia ID"], undefined);
  });
});

test("original evidence payload cannot be replaced with unrelated URL", async () => {
  const f = fixture("events.vystavy");
  await mockedFetch(f.request, async () => {
    const draft = (await listGeminiAgendaDrafts(f.env, "events.vystavy"))[0];
    await assert.rejects(() => mutateGeminiAgendaDraft(f.env, draft.stableKey, draft.id, {
      action: "save", lastEditedAt: draft.lastEditedAt,
      fields: { Popis: "Text\\nDôkazy:\\nother: https://unrelated.example" },
    }, "admin@example.sk"), { code: "STATE" });
    assert.equal(f.writes.length, 0);
  });
});

test("lost-found cannot write contacts, coordinates or exact private location", async () => {
  const f = fixture("help.stratene-a-najdene");
  await mockedFetch(f.request, async () => {
    const draft = (await listGeminiAgendaDrafts(f.env, "help.stratene-a-najdene"))[0];
    const restricted = new Set(["Latitude", "Longitude", "Verejný kontakt", "Presnosť lokality", "Miesto"]);
    for (const item of draft.fields) if (restricted.has(item.name))
      assert.equal(item.editable, false, item.name);
    await assert.rejects(() => mutateGeminiAgendaDraft(f.env, draft.stableKey, draft.id, {
      action: "save", lastEditedAt: draft.lastEditedAt, fields: { Mesto: "Ulica: Hlavná 42" },
    }, "admin@example.sk"), { code: "STATE" });
    assert.equal(f.writes.length, 0);
  });
});
