import {
  createManagedBreed,
  getManagedBreed,
  updateManagedBreed,
  validateNotionBreedCandidate,
  type ManagedBreed,
  type ManagedBreedInput,
} from "@/lib/breed-store";
import { SITE_URL } from "@/config/public-site";
import { mergeNotionBreedInput } from "@/lib/breed-sync-preservation";
import { recordNotionTransfer } from "@/lib/notion-transfer-audit";
import { readNotionFieldAuthorities, type NotionFieldMode } from "@/lib/notion-field-authority";
import {
  advanceBreedAdminReceipt, breedFieldSnapshot, parseBreedFieldSnapshot,
  planBreedNotionFieldDelta, type BreedFieldSnapshot, type BreedNotionField,
} from "@/lib/notion-breed-field-delta";
import { notionPageBelongsToDataSource } from "@/lib/notion-sync-page-ownership.ts";
import {
  planSafeBreedFields, partialBreedNotionReceipt, breedPartialError,
} from "@/lib/notion-breed-safe-patch";
import {
  cleanupNotionImageKeys,
  notionDateStartProperty,
  notionFlagEnabled,
  notionNumberProperty,
  notionPropertyRecord,
  notionRequest,
  notionRichTextProperty,
  notionSelectProperty,
  notionTextValue,
  notionTitleProperty,
  notionUrlProperty,
  prepareNotionMainImage,
  sha256Text,
  updateNotionSyncState,
  type NotionPage,
  type NotionSyncBindings,
} from "@/lib/notion-sync-shared";

export type NotionBreedSyncBindings = NotionSyncBindings & {
  NOTION_BREED_SYNC_ENABLED?: string;
  NOTION_BREEDS_DATA_SOURCE_ID?: string;
};

type BreedMappingRow = {
  breed_id: number;
  content_hash: string;
  last_synced_at: string;
};

/**
 * Backward-compatible receipt stored in the existing TEXT content_hash column.
 * No D1 migration, schema write or new cron is necessary. Legacy SHA receipts
 * are recognized and safely baselined before per-field delta sync begins.
 */
const RECEIPT_PREFIX = "breed-field-v1:";
function decodeBreedReceipt(contentHash: string | null | undefined) {
  const raw = contentHash ?? "";
  if (!raw.startsWith(RECEIPT_PREFIX))
    return { hash: raw, notion: null, admin: null };
  try {
    const encoded = JSON.parse(raw.slice(RECEIPT_PREFIX.length)) as {
      hash?: string; notion?: string; admin?: string;
    };
    if (typeof encoded.hash !== "string" || !/^[a-f0-9]{64}$/i.test(encoded.hash))
      throw new Error("BAD_RECEIPT_HASH");
    return {
      hash: encoded.hash,
      notion: parseBreedFieldSnapshot(encoded.notion ?? null),
      admin: parseBreedFieldSnapshot(encoded.admin ?? null),
    };
  } catch {
    throw new Error("BREED_FIELD_RECEIPT_REVIEW_REQUIRED");
  }
}
function encodeBreedReceipt(hash: string, receipt?: {
  notion: BreedFieldSnapshot; admin: BreedFieldSnapshot;
}) {
  return receipt ? RECEIPT_PREFIX + JSON.stringify({
    hash, notion: JSON.stringify(receipt.notion), admin: JSON.stringify(receipt.admin),
  }) : hash;
}

export type NotionBreedSyncSummary = {
  enabled: boolean;
  scanned: number;
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
};

const SYNC_ACTOR = "notion-breed-sync@psipedia.sk";
// Includes approved editorial updates for already published canonical breeds.
const MAX_SYNC_ITEMS = 500;
const MAX_EDITORIAL_UPDATES_PER_SWEEP = 25;

function checkboxProperty(page: NotionPage, name: string) {
  return notionPropertyRecord(page, name)?.checkbox === true;
}

function optionalNumber(page: NotionPage, name: string) {
  const value = notionNumberProperty(page, name);
  return value == null ? undefined : value;
}

function splitList(value: string) {
  return value.split(";").map((item) => item.trim()).filter(Boolean).slice(0, 30);
}

function parseSources(value: string) {
  return splitList(value).flatMap((item) => {
    const separator = item.lastIndexOf("|");
    const rawLabel = separator >= 0 ? item.slice(0, separator).trim() : "";
    const rawUrl = separator >= 0 ? item.slice(separator + 1).trim() : item.trim();
    try {
      const url = new URL(rawUrl);
      if (url.protocol !== "https:" && url.protocol !== "http:") return [];
      return [{
        label: rawLabel || url.hostname.replace(/^www\./, ""),
        url: url.toString(),
      }];
    } catch {
      return [];
    }
  });
}

function optionalStructuredBreedField(
  page: NotionPage,
  property: string,
  kind: "object" | "array",
): Record<string, unknown> | unknown[] | undefined {
  const raw = notionRichTextProperty(page, property);
  if (!raw) return undefined; // Absent staging columns never clear canonical D1.
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { return undefined; }
  if (kind === "array" ? !Array.isArray(parsed) : !parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return undefined;
  }
  return parsed as Record<string, unknown> | unknown[];
}

const FCI_NOTION_DETAIL_COLUMNS = [
  ["status_fci", "FCI status"],
  ["historicky_suhrn", "FCI historický súhrn"],
  ["celkovy_vzhlad", "FCI celkový vzhľad"],
  ["dolezite_proporcie", "FCI proporcie"],
  ["povaha_temperament", "FCI povaha a temperament"],
  ["hlava_lebecna_cast", "FCI lebka"],
  ["hlava_tvarova_cast", "FCI tvár"],
  ["oci", "FCI oči"],
  ["usi", "FCI uši"],
  ["krk", "FCI krk"],
  ["telo", "FCI telo"],
  ["chvost", "FCI chvost"],
  ["predne_koncatiny", "FCI predné končatiny"],
  ["zadne_koncatiny", "FCI zadné končatiny"],
  ["pohyb", "FCI pohyb"],
  ["koza", "FCI koža"],
  ["srst", "FCI srsť"],
  ["farba", "FCI farba"],
  ["vyska_pes_cm", "FCI výška pes cm"],
  ["vyska_suka_cm", "FCI výška suka cm"],
  ["hmotnost_pes_kg", "FCI hmotnosť pes kg"],
  ["hmotnost_suka_kg", "FCI hmotnosť suka kg"],
  ["velkost_hmotnost_poznamka", "FCI veľkosť a hmotnosť poznámka"],
  ["chyby", "FCI chyby"],
  ["zavazne_chyby", "FCI závažné chyby"],
  ["diskvalifikacne_chyby", "FCI diskvalifikačné chyby"],
  ["poznamka_chov", "FCI chov poznámka"],
  ["vyuzitie", "FCI využitie"],
  ["fci_skupina_nazov", "FCI skupina názov"],
  ["fci_sekcia_nazov", "FCI sekcia názov"],
  ["zdroj_poznamka", "FCI zdroj poznámka"],
  ["fci_nomenklatura_url", "FCI nomenklatúra URL"],
  ["fci_standard_pdf", "FCI štandard PDF"],
] as const;
const BREED_NOTION_EDITORIAL_COLUMNS = [
  ["overview", "Redakcia prehľad"],
  ["coatCare", "Redakcia starostlivosť o srsť"],
  ["familyLife", "Redakcia život v rodine"],
  ["otherDogsLife", "Redakcia spolužitie so psami"],
  ["curiosities", "Redakcia zaujímavosti"],
  ["commonOwnerMistakes", "Redakcia chyby majiteľov"],
  ["exerciseTip", "Redakcia tip pohyb"],
  ["trainingTip", "Redakcia tip výcvik"],
  ["healthTip", "Redakcia tip zdravie"],
  ["coatTip", "Redakcia tip srsť"],
] as const;

function structuredBreedColumns(
  page: NotionPage, jsonProperty: string,
  columns: readonly (readonly [string, string])[],
): Record<string, unknown> | undefined {
  const raw=optionalStructuredBreedField(page,jsonProperty,"object") as Record<string,unknown>|undefined;
  const merged:Record<string,unknown>={...(raw??{})};
  for(const [key,column] of columns){
    const value=notionRichTextProperty(page,column);
    if(value)merged[key]=value;
  }
  return Object.keys(merged).length ? merged : undefined;
}

function breedFciNotionDetails(page: NotionPage): ManagedBreedInput["fciStandard"] {
  const merged=structuredBreedColumns(page,"FCI štandard JSON",FCI_NOTION_DETAIL_COLUMNS) ?? {};
  for(const [key,column] of FCI_NOTION_DETAIL_COLUMNS){
    if(key!=="fci_nomenklatura_url"&&key!=="fci_standard_pdf")continue;
    const url=notionUrlProperty(page,column);
    if(url)merged[key]=url;
  }
  return Object.keys(merged).length ? merged as unknown as ManagedBreedInput["fciStandard"] : undefined;
}

function breedEditorialNotionDetails(page: NotionPage): ManagedBreedInput["editorial"] {
  const merged=structuredBreedColumns(page,"Redakčné sekcie JSON",BREED_NOTION_EDITORIAL_COLUMNS) ?? {};
  const traits=optionalStructuredBreedField(page,"Redakcia hlavné vlastnosti JSON","array");
  if(traits)merged.heroTraits=traits;
  return Object.keys(merged).length ? merged as unknown as ManagedBreedInput["editorial"] : undefined;
}

/**
 * Malformed optional JSON never prevents independent text fields from syncing.
 * Each rejected structured group remains pending in the per-field receipt.
 */
function invalidStructuredBreedFields(page: NotionPage): Set<BreedNotionField> {
  const invalid=new Set<BreedNotionField>();
  for(const [property,kind,field] of [
    ["FCI štandard JSON","object","fciStandard"],
    ["Redakčné sekcie JSON","object","editorial"],
    ["Redakcia hlavné vlastnosti JSON","array","editorial"],
    ["Športy JSON","array","sports"],
  ] as const){
    const text=notionRichTextProperty(page,property);
    if(!text)continue;
    try{
      const parsed:unknown=JSON.parse(text);
      const valid=kind==="array" ? Array.isArray(parsed) : Boolean(parsed && typeof parsed==="object" && !Array.isArray(parsed));
      if(!valid)invalid.add(field);
    }catch{invalid.add(field);}
  }
  return invalid;
}

export function notionPageToManagedBreedInput(page: NotionPage): ManagedBreedInput {
  const name = notionTitleProperty(page, "Názov");
  const slug = notionRichTextProperty(page, "Slug");
  if (!name) throw new Error("Doplň v Notione názov plemena.");
  if (!slug) throw new Error("Doplň v Notione slug plemena.");

  const seoTitle = notionRichTextProperty(page, "SEO title");
  const metaDescription = notionRichTextProperty(page, "Meta description");

  return {
    name,
    slug,
    status: "draft",
    fciNumber: optionalNumber(page, "FCI číslo"),
    fciGroup: optionalNumber(page, "FCI skupina"),
    fciSection: notionRichTextProperty(page, "FCI sekcia"),
    fciSectionNumber: notionRichTextProperty(page, "FCI sekcia číslo"),
    officialFciName: notionRichTextProperty(page, "Oficiálny FCI názov"),
    validStandardDate: notionDateStartProperty(page, "Platnosť FCI štandardu") || null,
    workingTrial: notionRichTextProperty(page, "Pracovná skúška"),
    importKey: notionRichTextProperty(page, "Import kľúč") || null,
    // Opt-in structured fields: existing empty Notion properties do not erase
    // already reviewed D1 details. Validate in breed-store before writes.
    fciStandard: breedFciNotionDetails(page),
    editorial: breedEditorialNotionDetails(page),
    sports: optionalStructuredBreedField(page, "Športy JSON", "array") as unknown as ManagedBreedInput["sports"],
    editorialComplete: notionPropertyRecord(page, "Editorial complete") ? checkboxProperty(page, "Editorial complete") : undefined,
    origin: notionRichTextProperty(page, "Krajina pôvodu"),
    group: notionRichTextProperty(page, "Skupina"),
    size: notionRichTextProperty(page, "Veľkosť"),
    weight: notionRichTextProperty(page, "Hmotnosť"),
    height: notionRichTextProperty(page, "Výška"),
    lifespan: notionRichTextProperty(page, "Dĺžka života"),
    coat: notionRichTextProperty(page, "Srsť"),
    energy: optionalNumber(page, "Energia"),
    trainability: optionalNumber(page, "Trénovateľnosť"),
    family: optionalNumber(page, "Rodina"),
    children: optionalNumber(page, "Deti"),
    otherDogs: optionalNumber(page, "Iné psy"),
    apartment: optionalNumber(page, "Byt"),
    grooming: optionalNumber(page, "Starostlivosť o srsť"),
    shedding: optionalNumber(page, "Pĺznutie"),
    preyDrive: optionalNumber(page, "Lovecký pud"),
    intro: notionRichTextProperty(page, "Intro"),
    character: notionRichTextProperty(page, "Charakter"),
    needs: notionRichTextProperty(page, "Potreby"),
    history: notionRichTextProperty(page, "História"),
    exercise: notionRichTextProperty(page, "Pohyb"),
    training: notionRichTextProperty(page, "Výcvik"),
    health: notionRichTextProperty(page, "Zdravie"),
    healthRisks: splitList(notionRichTextProperty(page, "Zdravotné riziká")),
    goodFor: splitList(notionRichTextProperty(page, "Vhodné pre")),
    consider: splitList(notionRichTextProperty(page, "Zvážiť")),
    sources: parseSources(notionRichTextProperty(page, "Zdroje")),
    accent: "forest",
    seo: {
      title: seoTitle,
      description: metaDescription,
      ogTitle: seoTitle,
      ogDescription: metaDescription,
    },
  };
}

function validateReady(page: NotionPage, existingPublished: boolean) {
  if (existingPublished) return; // Publication is a canonical D1 fact, not a Notion editorial state.
  const state = notionSelectProperty(page, "Stav");
  if (state !== "Ready" && state !== "Publikované" && !checkboxProperty(page, "Profil skvalitnený")) {
    throw new Error("Plemeno nemá schválenú odbornú úpravu na synchronizáciu.");
  }
}

/** A missing mapping must never create a second copy of an existing breed. */
async function findUnmappedCanonicalBreed(database: D1Database, page: NotionPage, payload: ManagedBreedInput) {
  const slug = String(payload.slug ?? "");
  const fciNumber = payload.fciNumber;
  if (!slug || !Number.isSafeInteger(fciNumber) || Number(fciNumber) < 1) {
    return null; // No provable two-key identity; do not guess.
  }
  const rows = await database.prepare(
    "SELECT id, fci_number FROM managed_breeds WHERE slug = ? LIMIT 2",
  ).bind(slug).all<{ id: number; fci_number: number | null }>();
  if (!rows.results.length) return null;
  if (rows.results.length !== 1 || Number(rows.results[0].fci_number) !== fciNumber) {
    throw new Error("BREED_IDENTITY_REVIEW_REQUIRED: slug alebo FCI číslo sa nezhoduje.");
  }
  const id = rows.results[0].id;
  const claimedId = notionRichTextProperty(page, "Psipedia ID").trim();
  if (claimedId && claimedId !== String(id)) {
    throw new Error("BREED_IDENTITY_REVIEW_REQUIRED: Psipedia ID sa nezhoduje.");
  }
  const occupied = await database.prepare(
    "SELECT notion_page_id FROM breed_notion_sync WHERE breed_id = ? LIMIT 1",
  ).bind(id).first<{ notion_page_id: string }>();
  if (occupied && occupied.notion_page_id !== page.id) {
    throw new Error("BREED_MAPPING_REVIEW_REQUIRED: profil už patrí inej Notion stránke.");
  }
  const canonical = await getManagedBreed(id);
  // Never silently adopt an independently edited Admin draft. Backfill only
  // already public records whose identity is fully established.
  return canonical?.status === "published" ? canonical : null;
}

async function listEditableNotionBreeds(bindings: NotionBreedSyncBindings, dataSourceId: string) {
  const pages: NotionPage[] = [];
  let cursor: string | null = null;
  do {
    const response = await notionRequest<{
      results?: NotionPage[]; has_more?: boolean; next_cursor?: string | null;
    }>(bindings, `/data_sources/${encodeURIComponent(dataSourceId)}/query`, {
      method: "POST",
      body: JSON.stringify({
        filter: { or: [
          { property: "Stav", select: { equals: "Ready" } },
          { property: "Stav", select: { equals: "Publikované" } },
          { property: "Stav", select: { equals: "Na kontrolu" } },
          { property: "Profil skvalitnený", checkbox: { equals: true } },
        ] },
        sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
        page_size: Math.min(100, MAX_SYNC_ITEMS - pages.length),
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
    });
    pages.push(...(response.results ?? []));
    cursor = response.has_more ? response.next_cursor ?? null : null;
  } while (cursor && pages.length < MAX_SYNC_ITEMS);
  return pages;
}

async function loadMapping(database: D1Database, pageId: string) {
  return database.prepare(
    "SELECT breed_id, content_hash, last_synced_at FROM breed_notion_sync WHERE notion_page_id = ? LIMIT 1",
  ).bind(pageId).first<BreedMappingRow>();
}

async function upsertMapping(
  database: D1Database,
  page: NotionPage,
  breedId: number,
  contentHash: string,
  now: string,
  receipt?: { notion: BreedFieldSnapshot; admin: BreedFieldSnapshot },
) {
  // Never reassign an existing page to a different D1 ID.
  const committed = await database.prepare(`
    INSERT INTO breed_notion_sync (
      notion_page_id, breed_id, notion_last_edited_time, content_hash,
      last_synced_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(notion_page_id) DO UPDATE SET
      notion_last_edited_time = excluded.notion_last_edited_time,
      content_hash = excluded.content_hash,
      last_synced_at = excluded.last_synced_at,
      updated_at = excluded.updated_at
    WHERE breed_notion_sync.breed_id = excluded.breed_id
  `).bind(
    page.id, breedId, page.last_edited_time ?? null,
    encodeBreedReceipt(contentHash, receipt), now, now, now,
  ).run();
  if (committed.meta.changes !== 1) throw new Error("BREED_MAPPING_ID_CONFLICT");
}

async function assertNoUnmappedDuplicate(
  database: D1Database,
  payload: ManagedBreedInput,
) {
  const slug = String(payload.slug ?? "");
  const fciNumber = Number.isSafeInteger(payload.fciNumber) ? Number(payload.fciNumber) : null;
  const duplicate = await database.prepare(
    "SELECT id, slug, status, fci_number FROM managed_breeds WHERE slug = ? OR (? IS NOT NULL AND fci_number = ?) LIMIT 1",
  ).bind(slug, fciNumber, fciNumber).first<{ id: number; slug: string; status: string; fci_number: number | null }>();

  if (duplicate) {
    throw new Error(
      `Plemeno už v Psipedii existuje (ID ${duplicate.id}, slug ${duplicate.slug}). Automatický sync nevytvorí duplicitu; existujúci profil treba najprv explicitne prepojiť.`,
    );
  }
}

async function preparePayloadWithImage(
  bindings: NotionBreedSyncBindings,
  page: NotionPage,
  basePayload: ManagedBreedInput,
  existing?: ManagedBreed | null,
) {
  const sourceUrl = notionUrlProperty(page, "Hlavný obrázok URL");
  const prepared = await prepareNotionMainImage({
    bindings,
    sourceUrl,
    sourcePageUrl: notionUrlProperty(page, "Zdroj obrázka"),
    altText: notionRichTextProperty(page, "Alt text obrázka"),
    folder: "breeds",
    existingImageUrl: existing?.image ?? null,
    existingImageKey: existing?.imageKey ?? null,
  });

  return {
    payload: {
      ...basePayload,
      image: prepared.imageUrl ?? "",
      imageKey: prepared.imageKey,
      seo: {
        ...(basePayload.seo ?? {}),
        ogImage: basePayload.seo?.ogImage?.trim() || prepared.imageUrl || "",
      },
    } satisfies ManagedBreedInput,
    prepared,
  };
}


/**
 * A narrow, predictable Admin -> Notion write-back for ordinary breed draft
 * text. It deliberately excludes publication, slug, images, FCI identity and
 * fields without a one-to-one Notion property.
 */
const BREED_DRAFT_TEXT_FIELDS = [
  ["name", "Názov", "title"],
  ["origin", "Krajina pôvodu", "rich_text"],
  ["group", "Skupina", "rich_text"],
  ["size", "Veľkosť", "rich_text"],
  ["weight", "Hmotnosť", "rich_text"],
  ["height", "Výška", "rich_text"],
  ["lifespan", "Dĺžka života", "rich_text"],
  ["coat", "Srsť", "rich_text"],
  ["intro", "Intro", "rich_text"],
  ["character", "Charakter", "rich_text"],
  ["needs", "Potreby", "rich_text"],
  ["history", "História", "rich_text"],
  ["exercise", "Pohyb", "rich_text"],
  ["training", "Výcvik", "rich_text"],
  ["health", "Zdravie", "rich_text"],
  ["officialFciName", "Oficiálny FCI názov", "rich_text"],
  ["workingTrial", "Pracovná skúška", "rich_text"],
] as const;

function normalizedBreedText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function richTextNotionValue(text: string, kind: "title" | "rich_text") {
  const characters = Array.from(text);
  if (characters.length > 180_000) {
    throw new Error("BREED_NOTION_FIELD_EXCEEDS_RICH_TEXT_LIMIT");
  }
  const parts: Array<{ type: "text"; text: { content: string } }> = [];
  for (let i = 0; i < characters.length; i += 1800) {
    parts.push({ type: "text", text: { content: characters.slice(i, i + 1800).join("") } });
  }
  return { [kind]: parts };
}

function breedDraftTextChanges(before: ManagedBreed, after: ManagedBreed) {
  const edits: Array<{ key: (typeof BREED_DRAFT_TEXT_FIELDS)[number][0]; notionProperty: string; expected: string }> = [];
  const patch: Record<string, unknown> = {};
  for (const [key, notionProperty, kind] of BREED_DRAFT_TEXT_FIELDS) {
    const oldValue = normalizedBreedText(before[key]);
    const newValue = normalizedBreedText(after[key]);
    if (oldValue === newValue) continue;
    edits.push({ key, notionProperty, expected: newValue });
    patch[notionProperty] = richTextNotionValue(after[key], kind);
  }
  return { edits, patch };
}

function notionBreedTextValue(page: NotionPage, property: string) {
  return normalizedBreedText(property === "Názov"
    ? notionTitleProperty(page, property)
    : notionRichTextProperty(page, property));
}

async function notionBreedSourceHash(page: NotionPage) {
  const basePayload = notionPageToManagedBreedInput(page);
  const sourceUrl = notionUrlProperty(page, "Hlavný obrázok URL");
  const sourcePageUrl = notionUrlProperty(page, "Zdroj obrázka");
  const altText = notionRichTextProperty(page, "Alt text obrázka");
  return sha256Text(JSON.stringify({ basePayload, sourceUrl, sourcePageUrl, altText }));
}

export async function writeBackDraftBreedEditorialToNotion(args: {
  database: D1Database;
  bindings: NotionBreedSyncBindings;
  before: ManagedBreed;
  breed: ManagedBreed;
}) {
  if (!notionFlagEnabled(args.bindings.NOTION_BREED_SYNC_ENABLED)) {
    return { linked: false, updated: false, reason: "disabled" as const };
  }
  if (args.before.id !== args.breed.id || args.before.slug !== args.breed.slug
    || args.before.status !== "draft" || args.breed.status !== "draft") {
    return { linked: false, updated: false, reason: "unsupported-status" as const };
  }
  const { edits, patch } = breedDraftTextChanges(args.before, args.breed);
  if (!edits.length) return { linked: false, updated: false, reason: "no-mirrored-field-change" as const };

  const mapping = await args.database.prepare(
    "SELECT notion_page_id, content_hash FROM breed_notion_sync WHERE breed_id = ? LIMIT 1",
  ).bind(args.breed.id).first<{ notion_page_id: string; content_hash: string }>();
  if (!mapping) return { linked: false, updated: false, reason: "not-linked" as const };

  const dataSourceId = args.bindings.NOTION_BREEDS_DATA_SOURCE_ID?.trim() ?? "";
  const page = await notionRequest<NotionPage>(
    args.bindings, "/pages/" + encodeURIComponent(mapping.notion_page_id),
  );
  if (page.id !== mapping.notion_page_id
    || !notionPageBelongsToDataSource(page, dataSourceId)
    || notionSelectProperty(page, "Stav") !== "Ready"
    || notionRichTextProperty(page, "Psipedia ID") !== String(args.breed.id)) {
    throw new Error("BREED_NOTION_WRITEBACK_UNSAFE_TARGET");
  }
  if (await notionBreedSourceHash(page) !== decodeBreedReceipt(mapping.content_hash).hash) {
    throw new Error("BREED_NOTION_REMOTE_EDITORIAL_CHANGED");
  }

  // If the Notion field was not identical to the pre-edit Admin value,
  // its ownership is ambiguous; do not override it based on a page timestamp.
  for (const edit of edits) {
    if (notionBreedTextValue(page, edit.notionProperty)
      !== normalizedBreedText(args.before[edit.key])) {
      throw new Error("BREED_NOTION_FIELD_REVIEW_REQUIRED");
    }
  }
  const written = await notionRequest<NotionPage>(
    args.bindings, "/pages/" + encodeURIComponent(page.id), {
      method: "PATCH", body: JSON.stringify({ properties: patch }),
    },
  );
  if (!written.properties || written.id !== page.id
    || !notionPageBelongsToDataSource(written, dataSourceId)
    || notionRichTextProperty(written, "Psipedia ID") !== String(args.breed.id)) {
    throw new Error("BREED_NOTION_WRITEBACK_ECHO_UNVERIFIED");
  }
  const changedProperties = new Set(edits.map(e => e.notionProperty));
  for (const [, property] of BREED_DRAFT_TEXT_FIELDS) {
    const expected = changedProperties.has(property)
      ? edits.find(e => e.notionProperty === property)?.expected
      : notionBreedTextValue(page, property);
    if (notionBreedTextValue(written, property) !== expected) {
      throw new Error("BREED_NOTION_WRITEBACK_ECHO_UNVERIFIED");
    }
  }
  // A concurrent edit in a different (non-text) Notion property is not an
  // acknowledged common state. Keep the mapping unchanged for later review.
  const untouchedBefore = notionPageToManagedBreedInput(page);
  const untouchedAfter = notionPageToManagedBreedInput(written);
  for (const [key] of Object.entries(untouchedBefore)) {
    if (key === "seo") {
      if (JSON.stringify(untouchedBefore.seo) !== JSON.stringify(untouchedAfter.seo))
        throw new Error("BREED_NOTION_WRITEBACK_ECHO_UNVERIFIED");
      continue;
    }
    if (BREED_DRAFT_TEXT_FIELDS.some(([name]) => name === key)) continue;
    if (JSON.stringify(untouchedBefore[key as keyof ManagedBreedInput])
      !== JSON.stringify(untouchedAfter[key as keyof ManagedBreedInput])) {
      throw new Error("BREED_NOTION_WRITEBACK_ECHO_UNVERIFIED");
    }
  }

  const hash = await notionBreedSourceHash(written);
  const at = new Date().toISOString();
  const oldAdmin = decodeBreedReceipt(mapping.content_hash).admin
    ?? breedFieldSnapshot(args.before);
  const nextAdmin = advanceBreedAdminReceipt(
    oldAdmin, args.breed, edits.map(edit => edit.key),
  );
  const committed = await args.database.prepare(
    "UPDATE breed_notion_sync SET content_hash=?, notion_last_edited_time=?, " +
    "last_synced_at=?,updated_at=? " +
    "WHERE notion_page_id=? AND breed_id=? AND content_hash=?",
  ).bind(encodeBreedReceipt(hash, {
      notion: breedFieldSnapshot(notionPageToManagedBreedInput(written)),
      admin: nextAdmin,
    }), written.last_edited_time ?? at, at, at,
    page.id, args.breed.id, mapping.content_hash).run();
  if (committed.meta.changes !== 1) throw new Error("BREED_NOTION_MAPPING_VERSION_CHANGED");

  await updateNotionSyncState(args.bindings, page.id, {
    state: "Synchronizované", psipediaId: args.breed.id, syncedAt: at,
  });
  return { linked: true, updated: true, notionPageId: page.id };
}


/** Notion webhook reports property IDs, never trusted field names from HTTP.
 * Resolve IDs only against the authenticated, owner-verified page properties.
 * Canonical identity, publishing, media and Google-owned fields are excluded.
 */
const BREED_WEBHOOK_PROPERTIES = {
  name: "Názov", fciGroup: "FCI skupina", fciSection: "FCI sekcia",
  fciSectionNumber: "FCI sekcia číslo", officialFciName: "Oficiálny FCI názov",
  validStandardDate: "Platnosť FCI štandardu", workingTrial: "Pracovná skúška",
  origin: "Krajina pôvodu", group: "Skupina", size: "Veľkosť",
  weight: "Hmotnosť", height: "Výška", lifespan: "Dĺžka života",
  coat: "Srsť", energy: "Energia", trainability: "Trénovateľnosť",
  family: "Rodina", children: "Deti", otherDogs: "Iné psy",
  apartment: "Byt", grooming: "Starostlivosť o srsť",
  shedding: "Pĺznutie", preyDrive: "Lovecký pud", intro: "Intro",
  character: "Charakter", needs: "Potreby", history: "História",
  exercise: "Pohyb", training: "Výcvik", health: "Zdravie",
  healthRisks: "Zdravotné riziká", goodFor: "Vhodné pre",
  consider: "Zvážiť", sources: "Zdroje", "seo.title": "SEO title",
  "seo.description": "Meta description",
  fciStandard: "FCI štandard JSON", editorial: "Redakčné sekcie JSON", sports: "Športy JSON",
} as const;

/** Signed event IDs are evidence of an explicit Notion edit, not a blanket
 * permission to overwrite a legacy row whose independent Admin edits are unknown.
 */
function signedBreedChangedFields(page: NotionPage, changedPropertyIds: readonly string[]) {
  const ids = new Set(changedPropertyIds);
  const matches = (label: string) => {
    const property = notionPropertyRecord(page, label);
    const id = typeof property?.id === "string" ? property.id : "";
    return ids.has(id) || ids.has(label);
  };
  const direct = Object.entries(BREED_WEBHOOK_PROPERTIES)
    .filter(([, label]) => matches(label))
    .map(([field]) => field as keyof typeof BREED_WEBHOOK_PROPERTIES);
  // Dozens of explicit FCI/editorial columns map to one protected structured
  // field. A signed edit to any of them must be recognized, not dropped.
  if (FCI_NOTION_DETAIL_COLUMNS.some(([, column]) => matches(column))) direct.push("fciStandard");
  if (BREED_NOTION_EDITORIAL_COLUMNS.some(([, column]) => matches(column))
    || matches("Redakcia hlavné vlastnosti JSON")) direct.push("editorial");
  return [...new Set(direct)];
}

/**
 * Single CAS commit of all safely validated edits. Rejected/conflicting fields
 * keep their previous Notion receipt, so future sweeps can retry them.
 */
async function applySafeBreedSync(
  database:D1Database,
  bindings:NotionBreedSyncBindings,
  page:NotionPage,
  existing:ManagedBreed,
  plan:ReturnType<typeof planBreedNotionFieldDelta>,
  previousNotion:BreedFieldSnapshot,
  previousAdmin:BreedFieldSnapshot,
  latestNotion:BreedFieldSnapshot,
  authority:Readonly<Record<string,NotionFieldMode>>,
  contentHash:string,
  invalidFields:ReadonlySet<BreedNotionField>,
):Promise<"updated"|"unchanged">{
  const safe=planSafeBreedFields(existing,plan,invalidFields,validateNotionBreedCandidate);
  const now=new Date().toISOString();
  const actuallyChanged=JSON.stringify(breedFieldSnapshot(safe.candidate))
    !== JSON.stringify(breedFieldSnapshot(existing));
  const updated=actuallyChanged
    ? await updateManagedBreed(existing.id,{
        ...safe.candidate,
        status:existing.status,image:existing.image,imageKey:existing.imageKey,
        gallery:existing.gallery,accent:existing.accent,
        editorialComplete:existing.editorialComplete,
      },SYNC_ACTOR,existing.updatedAt,{preserveUnchangedInvalid:existing})
    : existing;
  if(!updated)throw new Error("BREED_PARTIAL_UPDATE_FAILED");
  const ignored=plan.changed.filter(key=>authority[key]==="admin");
  const notionReceipt=partialBreedNotionReceipt(previousNotion,latestNotion,safe.accepted,ignored);
  await upsertMapping(database,page,updated.id,contentHash,now,{
    notion:notionReceipt,
    admin:advanceBreedAdminReceipt(previousAdmin,updated,safe.accepted),
  });
  const error=safe.skipped.length ? breedPartialError(safe.skipped) : "";
  if(actuallyChanged || notionSelectProperty(page,"Sync stav")!==(error?"Chyba":"Synchronizované")
    || notionRichTextProperty(page,"Sync chyba")!==error
    || notionRichTextProperty(page,"Psipedia ID")!==String(updated.id)){
    await updateNotionSyncState(bindings,page.id,{
      state:error?"Chyba":"Synchronizované",psipediaId:updated.id,error,
      ...(actuallyChanged||!error?{syncedAt:now}:{}),
    });
  }
  if(error)console.warn(JSON.stringify({
    event:"notion_breed_partial_sync",notionPageId:page.id,breedId:updated.id,
    accepted:safe.accepted,skipped:safe.skipped,
  }));
  return actuallyChanged?"updated":"unchanged";
}

async function syncOneBreed(
  database: D1Database,
  bindings: NotionBreedSyncBindings,
  page: NotionPage,
  changedPropertyIds: readonly string[] = [],
  authority: Readonly<Record<string, NotionFieldMode>> = {},
  explicitField?: keyof typeof BREED_WEBHOOK_PROPERTIES,
  expectedNotionHash?: string,
): Promise<"created" | "updated" | "unchanged"> {
  const basePayload = notionPageToManagedBreedInput(page);
  const contentHash = await notionBreedSourceHash(page);
  const mapping = await loadMapping(database, page.id);
  const now = new Date().toISOString();
  const recovered = mapping ? null : await findUnmappedCanonicalBreed(database, page, basePayload);
  const current = mapping ? await getManagedBreed(Number(mapping.breed_id)) : recovered;
  // D1 breed_id is the stable join key after the one-time identity check.
  if (mapping) {
    const claimed = notionRichTextProperty(page, "Psipedia ID").trim();
    if (claimed && claimed !== String(mapping.breed_id))
      throw new Error("BREED_PSID_CONFLICT");
  }
  // Do not turn unapproved, unmapped Notion concepts into canonical records.
  if (!mapping && !current && notionSelectProperty(page, "Stav") === "Na kontrolu") return "unchanged";
  validateReady(page, current?.status === "published");
  // Backfill can safely link Research / Na kontrolu identities, but must not
  // treat that act of pairing as editorial approval. Hold the one-time initial
  // content import until this existing profile is explicitly Ready.
  const approvedForFirstImport = ["Ready", "Publikované"].includes(notionSelectProperty(page, "Stav"))
    || checkboxProperty(page, "Profil skvalitnený");
  if ((mapping?.content_hash.startsWith("identity-pending-editorial:") || recovered)
    && !approvedForFirstImport) return "unchanged";

  if (mapping || recovered) {
    const existing = current;
    if (!existing) {
      throw new Error("Notion záznam je prepojený na chýbajúce plemeno v Psipedii.");
    }
    if (!mapping && (existing.slug !== basePayload.slug || (basePayload.fciNumber != null
      && existing.fciNumber != null && basePayload.fciNumber !== existing.fciNumber))) {
      throw new Error("BREED_IDENTITY_REVIEW_REQUIRED");
    }
    const receipt = decodeBreedReceipt(mapping?.content_hash);
    const oldNotion = receipt.notion;
    const oldAdmin = receipt.admin;
    const fieldReceipt = oldNotion && oldAdmin ? { notion: oldNotion, admin: oldAdmin } : null;
    // A later Admin edit is not an acknowledgement from Notion. Never
    // mark its old snapshot "synchronized" or pull an older remote version
    // on top of the unacknowledged D1 revision.
    const lastAck = Date.parse(mapping?.last_synced_at ?? "");
    const adminEdit = Date.parse(existing.updatedAt);
    const canonicalTextDiffers = BREED_DRAFT_TEXT_FIELDS.some(([key, property]) =>
      normalizedBreedText(existing[key]) !== notionBreedTextValue(page, property));
    // Notion still equals the previous acknowledged source snapshot. This
    // allows a failed Admin -> Notion writeback to retry automatically on the
    // existing hourly sweep, without picking a winner from page timestamps.
    // The writer re-fetches and verifies ownership, each changed field and
    // PATCH echo before updating any mapping receipt.
    if (mapping && existing.status === "draft" && receipt.hash === contentHash && canonicalTextDiffers) {
      const lastCommonText = { ...existing };
      for (const [key, property] of BREED_DRAFT_TEXT_FIELDS) {
        lastCommonText[key] = notionBreedTextValue(page, property);
      }
      const result = await writeBackDraftBreedEditorialToNotion({
        database, bindings, before: lastCommonText, breed: existing,
      });
      if (!result.updated) throw new Error("BREED_ADMIN_WRITEBACK_NOT_ACKNOWLEDGED");
      return "updated";
    }
    // No global updatedAt gate: unrelated Admin changes must never block an
    // independently edited Notion column. The per-field receipt handles
    // same-column conflicts and the D1 CAS handles concurrent saves.


    // An admin-confirmed, one-field recovery is required for historical events
    // already acknowledged as a legacy baseline by the old implementation.
    // Require the exact viewed Notion value hash and no newer Admin revision.
    if (mapping && explicitField) {
      if (!expectedNotionHash || !/^[a-f0-9]{64}$/i.test(expectedNotionHash))
        throw new Error("BREED_EXPLICIT_HASH_REQUIRED");
      if (authority[explicitField] === "admin") throw new Error("BREED_FIELD_ADMIN_AUTHORITY");
      const actualHash = await sha256Text(JSON.stringify(breedFieldSnapshot(basePayload)[explicitField]) ?? "null");
      if (actualHash !== expectedNotionHash) throw new Error("BREED_EXPLICIT_REMOTE_CHANGED");
      if (!Number.isFinite(lastAck) || !Number.isFinite(adminEdit) || adminEdit > lastAck)
        throw new Error("BREED_EXPLICIT_ADMIN_CHANGED");
      const oldNotionSnapshot = breedFieldSnapshot(basePayload);
      const oldAdminSnapshot = breedFieldSnapshot(existing);
      oldNotionSnapshot[explicitField] = oldAdminSnapshot[explicitField];
      const plan = planBreedNotionFieldDelta(existing, basePayload,
        oldNotionSnapshot, oldAdminSnapshot, authority);
      if (plan.conflicts.length) throw new Error("BREED_EXPLICIT_FIELD_CONFLICT");
      const patch = plan.patch;
      const merged = { ...existing, ...patch, seo:{...existing.seo,...(patch.seo??{})},
        status:existing.status, image:existing.image,imageKey:existing.imageKey,
        gallery:existing.gallery,accent:existing.accent,
        editorialComplete:existing.editorialComplete } satisfies ManagedBreedInput;
      const updated = Object.keys(patch).length
        ? await updateManagedBreed(existing.id,merged,SYNC_ACTOR,existing.updatedAt)
        : existing;
      if (!updated) throw new Error("BREED_EXPLICIT_UPDATE_FAILED");
      await upsertMapping(database,page,updated.id,contentHash,new Date().toISOString(),{
        notion:plan.latest,admin:breedFieldSnapshot(updated),
      });
      await updateNotionSyncState(bindings,page.id,{
        state:"Synchronizované",psipediaId:updated.id,syncedAt:now,
      });
      return Object.keys(patch).length ? "updated" : "unchanged";
    }

    if (mapping && fieldReceipt) {
      const plan=planBreedNotionFieldDelta(existing,basePayload,
        fieldReceipt.notion,fieldReceipt.admin,authority);
      const invalid=invalidStructuredBreedFields(page);
      // Even if just one source field is invalid or contested, valid Notion
      // editorial edits are committed together. Skipped fields remain pending.
      if(!plan.changed.length&&!invalid.size
        && receipt.hash===contentHash
        && notionSelectProperty(page,"Sync stav")==="Synchronizované"
        && !notionRichTextProperty(page,"Sync chyba")
        && notionRichTextProperty(page,"Psipedia ID")===String(existing.id))return "unchanged";
      return applySafeBreedSync(database,bindings,page,existing,plan,
        fieldReceipt.notion,fieldReceipt.admin,plan.latest,authority,contentHash,invalid);
    }

    // Legacy SHA receipts lack a per-field baseline. The SIGNED webhook event
    // supplies exact changed property IDs. Never silently consume a first edit
    // by treating the already-edited page as the common baseline.
    if (mapping && !fieldReceipt
      && !mapping.content_hash.startsWith("identity-pending-editorial:")) {
      if (changedPropertyIds.length) {
        const touched = signedBreedChangedFields(page, changedPropertyIds);
        if (!touched.length) throw new Error("BREED_WEBHOOK_FIELDS_UNRESOLVED");
        // On legacy rows we cannot tell which Admin fields changed since the
        // last receipt. Reject any unacknowledged Admin revision instead of
        // silently overriding it (even if the edit was to another field).
        if (!Number.isFinite(lastAck) || !Number.isFinite(adminEdit) || adminEdit > lastAck) {
          throw new Error("BREED_LEGACY_CONCURRENT_ADMIN_EDIT");
        }
        const previousNotion = breedFieldSnapshot(basePayload);
        const previousAdmin = breedFieldSnapshot(existing);
        for (const field of touched) previousNotion[field] = previousAdmin[field];
        const plan = planBreedNotionFieldDelta(existing, basePayload, previousNotion, previousAdmin, authority);
        return applySafeBreedSync(database,bindings,page,existing,plan,
          previousNotion,previousAdmin,plan.latest,authority,contentHash,
          invalidStructuredBreedFields(page));
      }
      // A pending first Notion edit may be waiting in the inbox when an hourly
      // sweep runs first. Never acknowledge a changed historical SHA without
      // signed field IDs: that would permanently lose the pending edit.
      if (receipt.hash !== contentHash) return "unchanged";
      // A truly unchanged hourly page may initialize its common baseline.
      await upsertMapping(database, page, existing.id, contentHash, now, {
        notion: breedFieldSnapshot(basePayload),
        admin: breedFieldSnapshot(existing),
      });
      await updateNotionSyncState(bindings, page.id, {
        state: "Synchronizované", psipediaId: existing.id, syncedAt: now,
      });
      return "unchanged";
    }

    if (mapping && receipt.hash === contentHash) {
      if (notionSelectProperty(page, "Sync stav") === "Synchronizované"
        && notionRichTextProperty(page, "Psipedia ID") === String(existing.id)) {
        return "unchanged"; // Do not PATCH unchanged receipts and retrigger webhooks.
      }
      await upsertMapping(database, page, existing.id, contentHash, now, {
        notion: breedFieldSnapshot(basePayload), admin: breedFieldSnapshot(existing),
      });
      await updateNotionSyncState(bindings, page.id, {
        state: "Synchronizované",
        psipediaId: existing.id,
        syncedAt: now,
      });
      return "unchanged";
    }

    const mergedPayload = mergeNotionBreedInput(existing, basePayload);
    // Publication, canonical identity, related media and admin-owned editorial
    // enrichments stay intact. Notion owns only the supplied editorial fields.
    if (existing.status === "published") {
      // Legacy/first approved import has no trustworthy field receipt yet.
      // Use the existing canonical values as a validation baseline; a bad
      // source field must not prevent a valid unrelated editorial update.
      const previousAdmin=breedFieldSnapshot(existing);
      const actualNotion=breedFieldSnapshot(basePayload);
      const plan=planBreedNotionFieldDelta(existing,mergedPayload,
        previousAdmin,previousAdmin,authority);
      const previousNotion={...actualNotion};
      for(const field of plan.changed)previousNotion[field]=previousAdmin[field];
      return applySafeBreedSync(database,bindings,page,existing,plan,
        previousNotion,previousAdmin,actualNotion,authority,contentHash,
        invalidStructuredBreedFields(page));
    }
    const { payload, prepared } = await preparePayloadWithImage(bindings, page, mergedPayload, existing);
    try {
      const updated = await updateManagedBreed(existing.id, payload, SYNC_ACTOR, existing.updatedAt);
      if (!updated) throw new Error("Prepojené plemeno sa nepodarilo aktualizovať.");
      await cleanupNotionImageKeys(bindings.BUCKET, prepared.replacedKeys);
      await upsertMapping(database, page, updated.id, contentHash, new Date().toISOString(), {
        notion: breedFieldSnapshot(basePayload), admin: breedFieldSnapshot(updated),
      });
      await updateNotionSyncState(bindings, page.id, {
        state: "Synchronizované",
        psipediaId: updated.id,
        syncedAt: now,
      });
      return "updated";
    } catch (error) {
      await cleanupNotionImageKeys(bindings.BUCKET, [prepared.uploadedKey]);
      throw error;
    }
  }

  if (notionSelectProperty(page, "Stav") !== "Ready") {
    throw new Error("BREED_CREATE_REQUIRES_READY: nové plemeno sa nepublikuje z Notion.");
  }
  await assertNoUnmappedDuplicate(database, basePayload);
  const { payload, prepared } = await preparePayloadWithImage(bindings, page, basePayload);
  try {
    const created = await createManagedBreed(payload, SYNC_ACTOR);
    if (!created) throw new Error("Plemeno sa nepodarilo vytvoriť.");
    await upsertMapping(database, page, created.id, contentHash, new Date().toISOString(), {
      notion: breedFieldSnapshot(basePayload), admin: breedFieldSnapshot(created),
    });
    await updateNotionSyncState(bindings, page.id, {
      state: "Synchronizované",
      psipediaId: created.id,
      syncedAt: now,
    });
    return "created";
  } catch (error) {
    await cleanupNotionImageKeys(bindings.BUCKET, [prepared.uploadedKey]);
    throw error;
  }
}

export async function runNotionBreedSyncSweep(args: {
  database: D1Database;
  bindings: NotionBreedSyncBindings;
  targetPageId?: string;
  changedPropertyIds?: readonly string[];
  explicitField?: keyof typeof BREED_WEBHOOK_PROPERTIES;
  expectedNotionHash?: string;
}): Promise<NotionBreedSyncSummary> {
  const summary: NotionBreedSyncSummary = {
    enabled: notionFlagEnabled(args.bindings.NOTION_BREED_SYNC_ENABLED),
    scanned: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    failed: 0,
  };
  if (!summary.enabled) return summary;

  const dataSourceId = args.bindings.NOTION_BREEDS_DATA_SOURCE_ID?.trim();
  if (!dataSourceId) throw new Error("NOTION_BREEDS_DATA_SOURCE_ID nie je nakonfigurovaný.");

  const authority = await readNotionFieldAuthorities(args.database, "breeds");
  let pages: NotionPage[];
  if (args.targetPageId !== undefined) {
    if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(args.targetPageId))
      throw new Error("BREED_NOTION_TARGET_INVALID");
    const page = await notionRequest<NotionPage>(args.bindings, "/pages/" + encodeURIComponent(args.targetPageId));
    if (page.id !== args.targetPageId || !notionPageBelongsToDataSource(page, dataSourceId))
      throw new Error("BREED_NOTION_TARGET_UNSAFE");
    pages = [page];
  } else {
    pages = await listEditableNotionBreeds(args.bindings, dataSourceId);
  }
  for (const page of pages) {
    if (summary.created + summary.updated >= MAX_EDITORIAL_UPDATES_PER_SWEEP) break;
    summary.scanned += 1;
    try {
      const result = await syncOneBreed(args.database, args.bindings, page,
        args.changedPropertyIds ?? [], authority, args.explicitField, args.expectedNotionHash);
      summary[result] += 1;
    } catch (error) {
      summary.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(JSON.stringify({
        event: "notion_breed_sync_failed",
        notionPageId: page.id,
        error: message,
      }));
      try {
        await updateNotionSyncState(args.bindings, page.id, {
          state: "Chyba",
          error: message,
        });
      } catch (writeBackError) {
        console.error(JSON.stringify({
          event: "notion_breed_sync_writeback_failed",
          notionPageId: page.id,
          error: writeBackError instanceof Error ? writeBackError.message : String(writeBackError),
        }));
      }
    }
  }

  await recordNotionTransfer(args.database,"breeds","NOTION_TO_ADMIN",summary.created+summary.updated);
  return summary;
}

export async function writeBackPublishedBreedToNotion(args: {
  database: D1Database;
  bindings: NotionBreedSyncBindings;
  breed: Pick<ManagedBreed, "id" | "slug" | "status" | "publishedAt">;
}) {
  if (!notionFlagEnabled(args.bindings.NOTION_BREED_SYNC_ENABLED)) {
    return { linked: false, updated: false, reason: "disabled" as const };
  }
  if (args.breed.status !== "published") {
    return { linked: false, updated: false, reason: "not-published" as const };
  }

  const mapping = await args.database.prepare(
    "SELECT notion_page_id FROM breed_notion_sync WHERE breed_id = ? LIMIT 1",
  ).bind(args.breed.id).first<{ notion_page_id: string }>();
  if (!mapping?.notion_page_id) {
    return { linked: false, updated: false, reason: "not-linked" as const };
  }

  const now = new Date().toISOString();
  const publicUrl = `${SITE_URL}/plemena/${args.breed.slug}`;
  await notionRequest(
    args.bindings,
    `/pages/${encodeURIComponent(mapping.notion_page_id)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        properties: {
          "Stav": { select: { name: "Publikované" } },
          "URL Psipedia": { url: publicUrl },
          "Sync stav": { select: { name: "Synchronizované" } },
          "Sync chyba": notionTextValue(""),
          "Posledný sync": { date: { start: now } },
        },
      }),
    },
  );

  await args.database.prepare(
    "UPDATE breed_notion_sync SET last_synced_at = ?, updated_at = ? WHERE notion_page_id = ?",
  ).bind(now, now, mapping.notion_page_id).run();

  return { linked: true, updated: true, notionPageId: mapping.notion_page_id, publicUrl };
}
