import test from "node:test";
import assert from "node:assert/strict";
import {
  planHelpGeminiReviewSchema, CANONICAL_HELP_DATABASE_ID,
  CANONICAL_HELP_DATA_SOURCE_ID,
} from "../lib/gemini-help-notion-schema-rollout.ts";
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

function fixture(key, signed = false) {
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
  let mappedEntityId = null;
  const db = { prepare(sql) { return { bind(...params) { return {
    async first() { return sql.includes("notion_agenda_targets") ? { data_source_id: sources[params[0]] } : null; },
    async all() {
      if (sql.includes("gemini_notion_created_pages")) return { results: signed ? [{ notion_page_id: pageId }] : [] };
      if (!sql.includes("event_notion_sync") && !sql.includes("notion_agenda_sync"))
        throw Error("Unexpected D1 read " + sql);
      return { results: mappedEntityId === null ? [] : [{ notion_page_id: pageId, entity_id: mappedEntityId }] };
    },
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
  return { env, value, schema, writes, request, mapToCanonical(entityId) { mappedEntityId = entityId; } };
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

test("a D1 canonical mapping prevents re-review even when Notion Psipedia ID write-back is delayed", async () => {
  const f = fixture("events.vystavy");
  f.mapToCanonical(781);
  await mockedFetch(f.request, async () => {
    const draft = (await listGeminiAgendaDrafts(f.env, "events.vystavy"))[0];
    assert.equal(draft.psipediaId, "781");
    assert.equal(draft.reviewState, "IMPORTED");
    await assert.rejects(() => mutateGeminiAgendaDraft(f.env, "events.vystavy", draft.id, {
      action: "approve", confirm: true, lastEditedAt: draft.lastEditedAt,
    }, "admin@example.sk"), { code: "STATE" });
    assert.equal(f.writes.length, 0);
  });
});


test("all 12 non-directory categories can save supported title without changing status or other fields", async () => {
  const items = geminiAutomationCatalog.filter(item => item.section !== "directory");
  for (const item of items) {
    const f = fixture(item.stableKey);
    await mockedFetch(f.request, async () => {
      const draft = (await listGeminiAgendaDrafts(f.env, item.stableKey))[0];
      const field = f.schema.properties["Meno"] ? "Meno" : "Názov";
      const saved = await mutateGeminiAgendaDraft(f.env, item.stableKey, draft.id, {
        action: "save", lastEditedAt: draft.lastEditedAt, fields: { [field]: "Nový bezpečný názov" },
      }, "admin@example.sk");
      assert.equal(saved.name, "Nový bezpečný názov", item.stableKey);
      assert.equal(saved.reviewState, "NEW", item.stableKey);
      assert.deepEqual(Object.keys(f.writes[0]), [field], item.stableKey);
      assert.equal(f.writes[0]["Psipedia stav"], undefined, item.stableKey);
      assert.equal(f.writes[0].Stav, undefined, item.stableKey);
    });
  }
});

test("existing Notion values outside sync contract are visible but never editable", async () => {
  const f = fixture("events.vystavy");
  f.schema.properties["Príloha Notion"] = { type: "files" };
  f.value.properties["Príloha Notion"] = { type: "files", files: [{ name: "súbor" }] };
  await mockedFetch(f.request, async () => {
    const draft = (await listGeminiAgendaDrafts(f.env, "events.vystavy"))[0];
    const custom = draft.fields.find(field => field.name === "Príloha Notion");
    assert.equal(custom?.synced, false);
    assert.equal(custom?.editable, false);
    assert.equal(custom?.value, "súbor");
    await assert.rejects(() => mutateGeminiAgendaDraft(f.env, draft.stableKey, draft.id, {
      action: "save", lastEditedAt: draft.lastEditedAt, fields: { "Príloha Notion": "should fail" },
    }, "admin@example.sk"), { code: "STATE" });
    assert.equal(f.writes.length, 0);
  });
});

test("rich-text formatting and date ranges remain read-only to prevent lossy round-trips", async () => {
  const f = fixture("events.vystavy");
  f.value.properties["Popis"] = {
    type: "rich_text",
    rich_text: [{ plain_text: "Obsah\n\nDôkazy:\nhttps://source.example/dog",
      type: "text", annotations: { bold: true, color: "default" } }],
  };
  f.value.properties["Začiatok"] = { type: "date",
    date: { start: "2026-10-22", end: "2026-10-23" } };
  await mockedFetch(f.request, async () => {
    const draft = (await listGeminiAgendaDrafts(f.env, "events.vystavy"))[0];
    assert.equal(draft.fields.find(item => item.name === "Popis")?.editable, false);
    assert.equal(draft.fields.find(item => item.name === "Začiatok")?.editable, false);
    assert.equal(draft.fields.find(item => item.name === "Začiatok")?.value, "2026-10-22 – 2026-10-23");
    await assert.rejects(() => mutateGeminiAgendaDraft(f.env, draft.stableKey, draft.id, {
      action: "save", lastEditedAt: draft.lastEditedAt, fields: { "Začiatok": "2026-10-25" },
    }, "admin@example.sk"), { code: "STATE" });
    assert.equal(f.writes.length, 0);
  });
});

test("existing select schema options are exposed and invalid choices cannot be saved", async () => {
  const f = fixture("help.adopcia");
  f.schema.properties["Veľkosť"] = { type: "select", select: { options: [{ name: "Malý" }, { name: "Veľký" }] } };
  f.value.properties["Veľkosť"] = select("Malý");
  await mockedFetch(f.request, async () => {
    const draft = (await listGeminiAgendaDrafts(f.env, "help.adopcia"))[0];
    assert.deepEqual(draft.fields.find(item => item.name === "Veľkosť")?.options, ["Malý", "Veľký"]);
    await assert.rejects(() => mutateGeminiAgendaDraft(f.env, draft.stableKey, draft.id, {
      action: "save", lastEditedAt: draft.lastEditedAt, fields: { "Veľkosť": "Neexistujúca" },
    }, "admin@example.sk"), { code: "SCHEMA" });
    assert.equal(f.writes.length, 0);
  });
});

test("help-case slug is not an editable shortcut to implicit canonical creation", async () => {
  const f = fixture("help.zbierky");
  await mockedFetch(f.request, async () => {
    const draft = (await listGeminiAgendaDrafts(f.env, "help.zbierky"))[0];
    assert.equal(draft.fields.find(item => item.name === "Slug")?.editable, false);
    await assert.rejects(() => mutateGeminiAgendaDraft(f.env, draft.stableKey, draft.id, {
      action: "save", lastEditedAt: draft.lastEditedAt, fields: { Slug: "ready-to-import" },
    }, "admin@example.sk"), { code: "STATE" });
    assert.equal(f.writes.length, 0);
  });
});

test("Lost/Found only accepts canonical data source and matching Notion parent", async () => {
  const f = fixture("help.stratene-a-najdene");
  await mockedFetch(f.request, async () => {
    f.value.parent.data_source_id = "00000000-0000-0000-0000-000000000099";
    assert.deepEqual(await listGeminiAgendaDrafts(f.env, "help.stratene-a-najdene"), []);
    f.value.parent.data_source_id = sources["lost-found"];
    f.schema.parent.database_id = "00000000-0000-0000-0000-000000000099";
    await assert.rejects(() => listGeminiAgendaDrafts(f.env, "help.stratene-a-najdene"),
      { code: "SCHEMA" });
    assert.equal(f.writes.length, 0);
  });
});


test("published help cases are never reclassified as Gemini drafts", async () => {
  const f = fixture("help.zbierky");
  f.value.properties["Psipedia stav"] = rich("published");
  await mockedFetch(f.request, async () => {
    assert.deepEqual(await listGeminiAgendaDrafts(f.env, "help.zbierky"), []);
    assert.equal(f.writes.length, 0);
  });
});


function withInternalHelpReview(f) {
  f.schema.properties["Gemini kontrola"] = { type: "select",
    select: { options: ["Na kontrolu", "Schválené", "Odmietnuté"].map(name => ({ name })) } };
  f.schema.properties["Dôvod odmietnutia"] = { type: "rich_text" };
  f.value.properties["Gemini kontrola"] = { type: "select", select: null };
  f.value.properties["Dôvod odmietnutia"] = rich("");
  return f;
}

test("help internal review becomes available with both exact Notion properties, never published", async () => {
  for (const key of ["help.docasna-opatera", "help.zbierky", "help.dobrovolnictvo"]) {
    const f = withInternalHelpReview(fixture(key));
    await mockedFetch(f.request, async () => {
      const draft = (await listGeminiAgendaDrafts(f.env, key))[0];
      assert.equal(draft.reviewAvailable, true, key);
      assert.equal(draft.fields.find(item => item.name === "Slug")?.editable, true);
      const approved = await mutateGeminiAgendaDraft(f.env, key, draft.id, {
        action: "approve", confirm: true, lastEditedAt: draft.lastEditedAt,
      }, "admin@example.sk");
      assert.equal(approved.reviewState, "APPROVED");
      assert.equal(f.writes.length, 1);
      assert.deepEqual(Object.keys(f.writes[0]).sort(), ["Dôvod odmietnutia", "Gemini kontrola"].sort());
      assert.equal(f.writes[0]["Gemini kontrola"].select.name, "Schválené");
      assert.equal(f.value.properties["Psipedia stav"].rich_text[0].plain_text, "draft",
        "approval must never publish");
      assert.equal(f.writes[0]["Psipedia stav"], undefined);
      assert.equal(f.writes[0].Stav, undefined);
      assert.equal(f.writes[0]["Psipedia ID"], undefined);
    });
  }
});

test("help rejection requires a reason, can be restored, and never changes publication", async () => {
  const f = withInternalHelpReview(fixture("help.zbierky"));
  await mockedFetch(f.request, async () => {
    const draft = (await listGeminiAgendaDrafts(f.env, "help.zbierky"))[0];
    await assert.rejects(() => mutateGeminiAgendaDraft(f.env, draft.stableKey, draft.id, {
      action: "reject", confirm: true, lastEditedAt: draft.lastEditedAt,
    }, "admin@example.sk"), { code: "STATE" });
    assert.equal(f.writes.length, 0);
    const rejected = await mutateGeminiAgendaDraft(f.env, draft.stableKey, draft.id, {
      action: "reject", confirm: true, reason: "Nedostatočné dôkazy",
      lastEditedAt: draft.lastEditedAt,
    }, "admin@example.sk");
    assert.equal(rejected.reviewState, "REJECTED");
    assert.equal(rejected.rejectionReason, "Nedostatočné dôkazy");
    assert.equal(f.writes[0]["Gemini kontrola"].select.name, "Odmietnuté");
    assert.equal(f.writes[0]["Dôvod odmietnutia"].rich_text[0].text.content, "Nedostatočné dôkazy");
    assert.equal(f.value.properties["Psipedia stav"].rich_text[0].plain_text, "draft");
    const restored = await mutateGeminiAgendaDraft(f.env, draft.stableKey, draft.id, {
      action: "restore", confirm: true, lastEditedAt: rejected.lastEditedAt,
    }, "admin@example.sk");
    assert.equal(restored.reviewState, "NEW");
    assert.equal(restored.rejectionReason, "");
    assert.equal(f.writes[1]["Gemini kontrola"].select.name, "Na kontrolu");
    assert.equal(f.value.properties["Psipedia stav"].rich_text[0].plain_text, "draft");
  });
});

test("partial or incompatible help schema fails closed on concept listing", async () => {
  const f = fixture("help.zbierky");
  f.schema.properties["Gemini kontrola"] = { type: "select", select: { options: [{ name: "Schválené" }] } };
  await mockedFetch(f.request, async () => {
    await assert.rejects(() => listGeminiAgendaDrafts(f.env, "help.zbierky"), { code: "SCHEMA" });
    assert.equal(f.writes.length, 0);
  });
});

test("approved Help concept remains protected from stale moderator decisions", async () => {
  const f = withInternalHelpReview(fixture("help.zbierky"));
  await mockedFetch(f.request, async () => {
    const draft = (await listGeminiAgendaDrafts(f.env, "help.zbierky"))[0];
    await mutateGeminiAgendaDraft(f.env, draft.stableKey, draft.id, {
      action: "approve", confirm: true, lastEditedAt: draft.lastEditedAt,
    }, "admin@example.sk");
    await assert.rejects(() => mutateGeminiAgendaDraft(f.env, draft.stableKey, draft.id, {
      action: "reject", confirm: true, reason: "Konfliktný zápis",
      lastEditedAt: draft.lastEditedAt,
    }, "admin@example.sk"), { code: "CONFLICT" });
    assert.equal(f.writes.length, 1);
  });
});


test("merged #837 scheduler controls and #838 review panel coexist for 22 categories", async () => {
  const { readFile } = await import("node:fs/promises");
  const settings = await readFile(
    new URL("../components/admin-gemini-automation-settings.tsx", import.meta.url), "utf8");
  const scheduler = await readFile(
    new URL("../lib/gemini-automation-schedule.ts", import.meta.url), "utf8");
  assert.equal(geminiAutomationCatalog.length, 22);
  assert.equal((settings.match(/<AdminGeminiNotionDrafts\b/g) ?? []).length, 1,
    "exactly one canonical review panel is mounted for the selected category");
  assert.match(settings, /\{externalEnabled && selected \? \(/);
  assert.match(settings, /<AdminGeminiNotionDrafts key=\{selected\.stableKey\} stableKey=\{selected\.stableKey\}/);
  assert.match(settings, /<GeminiSettingsCard key=\{selected\.stableKey\}/);
  assert.doesNotMatch(settings, /<GeminiConceptLookup/);
  assert.doesNotMatch(settings, /Editor konceptov Podujatí a Pomoci psom doplní/);
  assert.match(settings, /geminiSchedulerOptions/);
  assert.match(settings, /geminiWeekdays/);
  assert.match(settings, /recommendedGeminiCadence/);
  assert.match(settings, /weekly_day: weeklyDay/);
  assert.match(settings, /cadence_minutes: cadenceMinutes/);
  assert.match(settings, /\/admin\/automatizacie-gemini\/prompty\?stable_key=/);
  assert.match(settings, /Spustiť vyhľadávanie teraz/);
  assert.match(settings, /canManuallyRun/);
  assert.match(scheduler, /geminiSchedulerOptions/);
  assert.match(scheduler, /geminiWeekdays/);
});


test("production Help schema preflight is read-only, canonical and idempotent", () => {
  const input = {
    databaseId: CANONICAL_HELP_DATABASE_ID,
    dataSourceId: CANONICAL_HELP_DATA_SOURCE_ID,
    schema: {
      "Názov": { type: "title" }, "Psipedia stav": { type: "text" },
      "Psipedia ID": { type: "text" }, "Slug": { type: "text" },
    },
  };
  const first = planHelpGeminiReviewSchema(input);
  assert.equal(first.existingProperties, 4);
  assert.equal(first.additions.length, 2);
  assert.equal(first.statements,
    'ADD COLUMN "Gemini kontrola" SELECT(\'Na kontrolu\':gray, \'Schválené\':green, \'Odmietnuté\':red); ADD COLUMN "Dôvod odmietnutia" RICH_TEXT');
  assert.equal(first.noOp, false);
  const review = {
    type: "select",
    options: [{ name: "Na kontrolu" }, { name: "Schválené" }, { name: "Odmietnuté" }],
  };
  const oneExisting = planHelpGeminiReviewSchema({
    ...input, schema: { ...input.schema, "Gemini kontrola": review },
  });
  assert.deepEqual(oneExisting.additions, ['ADD COLUMN "Dôvod odmietnutia" RICH_TEXT']);
  const alreadyDone = planHelpGeminiReviewSchema({
    ...input,
    schema: {
      ...input.schema, "Gemini kontrola": review,
      "Dôvod odmietnutia": { type: "text" },
    },
  });
  assert.equal(alreadyDone.noOp, true);
  assert.equal(alreadyDone.statements, "");
});

test("production Help schema preflight rejects wrong source, wrong parent or incompatible duplicates", () => {
  const correct = {
    databaseId: CANONICAL_HELP_DATABASE_ID,
    dataSourceId: CANONICAL_HELP_DATA_SOURCE_ID,
    schema: {
      "Názov": { type: "title" }, "Psipedia stav": { type: "text" },
      "Psipedia ID": { type: "text" }, "Slug": { type: "text" },
    },
  };
  assert.throws(() => planHelpGeminiReviewSchema({
    ...correct, dataSourceId: "01d07d71-88e7-45fc-8188-8de4146c5479",
  }), /WRONG_CANONICAL_HELP_DATA_SOURCE/);
  assert.throws(() => planHelpGeminiReviewSchema({
    ...correct, databaseId: "00000000-0000-0000-0000-000000000000",
  }), /WRONG_CANONICAL_HELP_DATA_SOURCE/);
  assert.throws(() => planHelpGeminiReviewSchema({
    ...correct, schema: { "Name": { type: "title" } },
  }), /NOT_CANONICAL_HELP_SCHEMA/);
  assert.throws(() => planHelpGeminiReviewSchema({
    ...correct, schema: {
      ...correct.schema,
      "Gemini kontrola": { type: "select", options: [
        { name: "Na kontrolu" }, { name: "Schválené" }, { name: "Odmietnuté" },
        { name: "Publikované" },
      ] },
    },
  }), /GEMINI_REVIEW_SCHEMA_CONFLICT/);
  assert.throws(() => planHelpGeminiReviewSchema({
    ...correct, schema: { ...correct.schema, "Dôvod odmietnutia": { type: "number" } },
  }), /GEMINI_REJECTION_SCHEMA_CONFLICT/);
});

test("Help review decision refuses options beyond the exact approved moderation choices", async () => {
  const f = withInternalHelpReview(fixture("help.zbierky"));
  f.schema.properties["Gemini kontrola"].select.options.push({ name: "Publikované" });
  await mockedFetch(f.request, async () => {
    await assert.rejects(() => listGeminiAgendaDrafts(f.env, "help.zbierky"), { code: "SCHEMA" });
    assert.equal(f.writes.length, 0);
  });
});


test("Help approved but not yet imported draft can be rejected and restored without publishing", async () => {
  const f = withInternalHelpReview(fixture("help.docasna-opatera"));
  await mockedFetch(f.request, async () => {
    const draft = (await listGeminiAgendaDrafts(f.env, "help.docasna-opatera"))[0];
    const approved = await mutateGeminiAgendaDraft(f.env, draft.stableKey, draft.id, {
      action: "approve", confirm: true, lastEditedAt: draft.lastEditedAt,
    }, "admin@example.sk");
    assert.equal(approved.reviewState, "APPROVED");
    const rejected = await mutateGeminiAgendaDraft(f.env, draft.stableKey, draft.id, {
      action: "reject", confirm: true, reason: "Neoveriteľný zdroj",
      lastEditedAt: approved.lastEditedAt,
    }, "admin@example.sk");
    assert.equal(rejected.reviewState, "REJECTED");
    assert.equal(rejected.rejectionReason, "Neoveriteľný zdroj");
    const restored = await mutateGeminiAgendaDraft(f.env, draft.stableKey, draft.id, {
      action: "restore", confirm: true, lastEditedAt: rejected.lastEditedAt,
    }, "admin@example.sk");
    assert.equal(restored.reviewState, "NEW");
    assert.equal(restored.rejectionReason, "");
    assert.equal(f.writes.length, 3);
    for (const patch of f.writes) {
      assert.deepEqual(Object.keys(patch).sort(), ["Gemini kontrola", "Dôvod odmietnutia"].sort());
      assert.equal(patch["Psipedia stav"], undefined);
      assert.equal(patch["Psipedia ID"], undefined);
    }
    assert.equal(f.value.properties["Psipedia stav"].rich_text[0].plain_text, "draft");
  });
});

test("Help editor offers reject for internally approved but nonimported draft", async () => {
  const { readFile } = await import("node:fs/promises");
  const editor = await readFile(
    new URL("../components/admin-gemini-agenda-draft-editor.tsx", import.meta.url), "utf8");
  assert.match(editor, /reviewState !== "APPROVED" \|\| draft\.agenda === "help-cases"/);
  assert.match(editor, /reviewState === "REJECTED" \? "restore" : "reject"/);
  assert.match(editor, /confirm === "reject" && draft\.agenda === "help-cases"/);
});

for (const key of ["events.vystavy", "help.zbierky", "help.utulky", "help.adopcia", "help.stratene-a-najdene"]) {
  test(key + " signed callback makes clean content reviewable; note stays separate", async () => {
    const f = fixture(key, true);
    f.value.properties.Popis = rich("Prirodzený slovenský opis bez technických dôkazov.");
    f.value.properties["Gemini poznámka"] = rich("Overte možnú duplicitu.");
    f.schema.properties["Gemini poznámka"] = { type: "rich_text" };
    await mockedFetch(f.request, async () => {
      const [draft] = await listGeminiAgendaDrafts(f.env, key);
      assert.equal(draft.attribution, "SIGNED_CALLBACK");
      assert.equal(draft.geminiNote, "Overte možnú duplicitu.");
      assert.ok(!draft.fields.some(field => field.name === "Gemini poznámka"));
    });
  });
}
test("an ordinary unmarked Notion draft is not attributed to Gemini", async () => {
  const f = fixture("events.vystavy");
  f.value.properties.Popis = rich("Obyčajný koncept redaktora.");
  await mockedFetch(f.request, async () => {
    assert.deepEqual(await listGeminiAgendaDrafts(f.env, "events.vystavy"), []);
  });
});
