import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  isDirectoryEventPilotCategory,
  isDirectoryFieldEventCategory,
} from "../lib/notion-directory-field-event-scope.ts";
import {
  breederApplyNotionChanges,
  breederAdminChangedFields,
  breederNotionChangedFields,
} from "../lib/notion-breeder-field-events.ts";

const get = path => readFile(new URL(path, import.meta.url), "utf8");

test("kynologicke-kluby use the veterinary per-field pipeline, not record-wide reconciliation", async () => {
  assert.equal(isDirectoryEventPilotCategory("kynologicke-kluby"), true);
  assert.equal(isDirectoryFieldEventCategory("kynologicke-kluby"), true);
  assert.equal(isDirectoryEventPilotCategory("chovatelske-kluby"), false);
  assert.equal(isDirectoryFieldEventCategory("chovatelske-kluby"), false);

  const [sync, webhook, admin, editor] = await Promise.all([
    get("../lib/notion-directory-sync.ts"),
    get("../app/api/integrations/notion/webhook/route.ts"),
    get("../app/api/admin/directory/[id]/route.ts"),
    get("../components/admin-directory-editor.tsx"),
  ]);

  assert.ok(webhook.includes("'kynologicke-kluby'"),
    "the authenticated directory webhook must dispatch mapped club events");
  assert.match(sync, /isDirectoryFieldEventCategory\(profile\.category\)/);
  assert.match(sync, /breederWebhookPropertyIds: input\.changedPropertyIds/);
  assert.match(sync, /breederAdminFields: input\.breederAdminFields/);
  assert.match(sync, /!input\.targetPageId && isDirectoryFieldEventCategory\(propertyText\(candidate, "Kategória"\)\)/);
  assert.match(sync, /path === "services" && isDirectoryEventPilotCategory\(current\.category\)/);
  assert.match(admin, /isDirectoryFieldEventCategory\(before\.category\)/);
  assert.match(editor, /isDirectoryFieldEventCategory\(profile\.category\)/);

  // The legacy hourly candidate lists must also exclude per-field profiles,
  // otherwise the batch limit can be consumed by clubs which are then skipped.
  assert.match(sync, /AND dp\.category NOT IN \('veterinari', 'kynologicke-kluby', 'fyzioterapia', 'dalsie-sluzby'\)/);
  assert.match(sync, /AND dp\.category NOT IN \('treneri', 'veterinari', 'kynologicke-kluby', 'fyzioterapia', 'dalsie-sluzby'\)/);
});

test("club webhook only changes the explicitly edited Notion editorial property", () => {
  const notionProperties = {
    "Názov": { id: "name-property" },
    "Perex": { id: "excerpt-property" },
    "Popis": { id: "description-property" },
    "Služby": { id: "legacy-services-property" },
    "Google Place ID": { id: "protected-place-id" },
  };
  assert.deepEqual(
    breederNotionChangedFields(notionProperties, ["description-property"]),
    ["description"],
  );
  assert.deepEqual(
    breederNotionChangedFields(notionProperties, ["protected-place-id"]),
    [],
  );
  const before = {
    name: "DogSport Senec", excerpt: "Perex z Adminu",
    description: "Pôvodný popis", services: ["Existujúca V3 služba"],
    seo: { title: "Pôvodné SEO" },
  };
  const notion = {
    name: "Neodhlasovaná zmena", excerpt: "Neodhlasovaná zmena",
    description: "x", services: ["Zmena starého zoznamu"],
    seo: { title: "Neodhlasovaná zmena" },
  };
  const after = breederApplyNotionChanges(before, notion, ["description"]);
  assert.equal(after.description, "x");
  assert.equal(after.name, before.name);
  assert.equal(after.excerpt, before.excerpt);
  assert.deepEqual(after.services, before.services);
  assert.equal(after.seo.title, before.seo.title);

  assert.deepEqual(
    breederAdminChangedFields(before, { ...before, description: "Admin zmena" }),
    ["description"],
  );
});
