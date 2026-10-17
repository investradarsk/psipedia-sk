import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { geminiAutomationCatalog, geminiAutomationSections } from "../lib/gemini-automation-catalog.ts";
import {
  GEMINI_PROMPT_MAX_LENGTH, GEMINI_PROMPT_MIN_LENGTH,
  GeminiCategoryPromptValidationError,
  defaultGeminiCategoryPrompt, geminiCategoryPromptViews,
  parseGeminiCategoryPromptSave, parseGeminiCategoryPromptReset,
} from "../lib/gemini-automation-category-prompts.ts";
import {
  getGeminiCategoryPrompt, listGeminiCategoryPrompts,
  saveGeminiCategoryPrompt, resetGeminiCategoryPrompt,
} from "../lib/gemini-automation-category-prompt-store.ts";

const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const migration = source("drizzle/0125_gemini_category_prompts.sql");

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(migration);
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return {
        bind(...args) {
          return {
            async first() { return statement.get(...args) ?? null; },
            async all() { return { results: statement.all(...args) }; },
            async run() {
              const result = statement.run(...args);
              return { meta: { changes: result.changes } };
            },
          };
        },
        async all() { return { results: statement.all() }; },
      };
    },
  };
  return { sqlite, db };
}

test("catalog remains the only category source: exactly 22 distinct tailored defaults", () => {
  assert.equal(geminiAutomationCatalog.length, 22);
  assert.deepEqual(geminiAutomationSections.map(s => s.key), ["directory", "events", "help"]);
  const prompts = geminiCategoryPromptViews([]);
  assert.equal(prompts.length, 22);
  assert.equal(new Set(prompts.map(p => p.stableKey)).size, 22);
  assert.equal(new Set(prompts.map(p => p.defaultPrompt)).size, 22);
  assert.ok(prompts.every(p => !p.customized && p.userPrompt === null &&
    p.effectivePrompt === p.defaultPrompt && p.updatedAt === null));
  for (const p of prompts) {
    assert.equal(p.defaultPrompt, defaultGeminiCategoryPrompt(p));
    assert.ok(p.defaultPrompt.includes(p.label));
    assert.match(p.defaultPrompt, /Google/);
    assert.match(p.defaultPrompt, /Notionu/);
    assert.match(p.defaultPrompt, /neverejný koncept/);
    assert.match(p.defaultPrompt, /duplicit/);
    assert.ok(p.defaultPrompt.length >= GEMINI_PROMPT_MIN_LENGTH &&
      p.defaultPrompt.length <= GEMINI_PROMPT_MAX_LENGTH);
  }
  assert.match(prompts.find(p => p.stableKey === "events.vystavy").defaultPrompt, /budúce/);
  assert.match(prompts.find(p => p.stableKey === "help.stratene-a-najdene").defaultPrompt, /súkromné kontakty/);
});

test("read/list uses defaults without writing or seeding D1", async () => {
  const { sqlite, db } = fixture();
  try {
    const list = await listGeminiCategoryPrompts(db);
    assert.equal(list.length, 22);
    assert.ok(list.every(p => !p.customized && p.userPrompt === null));
    assert.equal((await getGeminiCategoryPrompt(db, "events.vystavy")).effectivePrompt,
      defaultGeminiCategoryPrompt(geminiAutomationCatalog.find(p => p.stableKey === "events.vystavy")));
    assert.equal(await getGeminiCategoryPrompt(db, "unknown.category"), null);
    assert.equal(sqlite.prepare("SELECT count(*) n FROM gemini_category_prompts").get().n, 0);
  } finally { sqlite.close(); }
});

test("D1 saves, updates, resets only selected override and isolates all other categories", async () => {
  const { sqlite, db } = fixture();
  const first = "Vyhľadaj nové veterinárne pracovisko, dohladaj fakty a ulož iba koncept.";
  const next = "Vyhľadaj ďalšie veterinárne pracovisko s verejnými kontaktmi a ulož koncept.";
  const event = "Vyhľadaj nové budúce podujatie, skontroluj termín a vytvor koncept.";
  try {
    const initial = await listGeminiCategoryPrompts(db);
    const key = "directory.veterinari";
    const saved = await saveGeminiCategoryPrompt(db, key, first, new Date("2026-10-14T09:00:00Z"));
    assert.equal(saved.userPrompt, first);
    assert.equal(saved.effectivePrompt, first);
    assert.equal(saved.updatedAt, "2026-10-14T09:00:00.000Z");
    assert.equal(saved.customized, true);
    await saveGeminiCategoryPrompt(db, "events.vystavy", event);
    await saveGeminiCategoryPrompt(db, key, next, new Date("2026-10-14T10:00:00Z"));
    assert.equal((await getGeminiCategoryPrompt(db, key)).userPrompt, next);
    assert.equal((await getGeminiCategoryPrompt(db, "events.vystavy")).effectivePrompt, event);
    assert.equal(sqlite.prepare("SELECT count(*) n FROM gemini_category_prompts").get().n, 2);

    const restored = await resetGeminiCategoryPrompt(db, key);
    assert.equal(restored.customized, false);
    assert.equal(restored.userPrompt, null);
    assert.equal(restored.effectivePrompt, initial.find(p => p.stableKey === key).defaultPrompt);
    assert.equal((await getGeminiCategoryPrompt(db, "events.vystavy")).effectivePrompt, event);
    assert.equal(sqlite.prepare("SELECT count(*) n FROM gemini_category_prompts").get().n, 1);
    await resetGeminiCategoryPrompt(db, key);
    assert.equal(sqlite.prepare("SELECT count(*) n FROM gemini_category_prompts").get().n, 1);
    assert.equal((await listGeminiCategoryPrompts(db)).filter(p => p.customized).length, 1);
  } finally { sqlite.close(); }
});

test("validation rejects unknown keys, extraneous technical flags, publication requests and invalid lengths", () => {
  const valid = { stable_key: "directory.veterinari", user_prompt: "Vyhľadaj nový subjekt a zapíš overené informácie iba do konceptu." };
  assert.deepEqual(parseGeminiCategoryPromptSave(valid), {
    stableKey: valid.stable_key, userPrompt: valid.user_prompt,
  });
  assert.deepEqual(parseGeminiCategoryPromptReset({ stable_key: valid.stable_key }),
    { stableKey: valid.stable_key });
  for (const bad of [
    null, {}, { ...valid, stable_key: "directory.unknown" },
    { ...valid, auto_publish: true }, { ...valid, enabled: true },
    { ...valid, user_prompt: "" }, { ...valid, user_prompt: "x".repeat(39) },
    { ...valid, user_prompt: "x".repeat(6001) }, { ...valid, user_prompt: 7 },
    { ...valid, user_prompt: "Publikuj priamo na webe, bez schválenia. " + valid.user_prompt },
  ]) {
    assert.throws(() => parseGeminiCategoryPromptSave(bad), GeminiCategoryPromptValidationError);
  }
  for (const bad of [null, {}, { stable_key: "fake" }, { stable_key: valid.stable_key, publish: true }]) {
    assert.throws(() => parseGeminiCategoryPromptReset(bad), GeminiCategoryPromptValidationError);
  }
  assert.equal(parseGeminiCategoryPromptSave({
    ...valid, user_prompt: "  " + valid.user_prompt + "\r\n",
  }).userPrompt, valid.user_prompt);
});

test("schema and admin API keep overrides separate from worker dispatch and publications", () => {
  const { sqlite } = fixture();
  try {
    assert.deepEqual(sqlite.prepare("PRAGMA table_info('gemini_category_prompts')").all().map(p => p.name),
      ["stable_key", "user_prompt", "updated_at"]);
    assert.throws(() => sqlite.prepare(
      "INSERT INTO gemini_category_prompts(stable_key, user_prompt) VALUES ('x', 'short')",
    ).run());
  } finally { sqlite.close(); }
  const route = source("app/api/admin/gemini-automation/prompts/route.ts");
  const page = source("app/admin/automatizacie-gemini/prompty/page.tsx");
  const store = source("lib/gemini-automation-category-prompt-store.ts");
  assert.match(route, /getAdminApiUser/);
  assert.match(route, /requireAdminMutation\(request\)/);
  assert.match(route, /"no-store"/);
  assert.match(page, /requireAdminPageUser/);
  assert.match(page, /selectedKey/);
  assert.doesNotMatch(store + route + page, /dispatchExternalGemini|generateContent|publishArticle|runGeminiAutomation|NOTION_API_TOKEN/);
});
