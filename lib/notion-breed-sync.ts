import { breedProfileHref } from "@/lib/breed-canonical";
import { notionPageMustSkipInboundSync } from "./admin-record-lifecycle";
import {
  createManagedBreed,
  getManagedBreed,
  updateManagedBreed,
  validateNotionBreedCandidate,
  type ManagedBreed,
  type ManagedBreedInput,
} from "@/lib/breed-store";
import { SITE_URL } from "@/config/public-site";
import { writeBackBreedToWorkCopy } from "@/lib/notion-breed-workcopy-sync";
import { mergeNotionBreedInput } from "@/lib/breed-sync-preservation";
import { recordNotionTransfer } from "@/lib/notion-transfer-audit";
import { readNotionFieldAuthorities, type NotionFieldMode } from "@/lib/notion-field-authority";
import type { ManualFieldDirection } from "@/lib/notion-manual-transfer-plan";
import {
  advanceBreedAdminReceipt, breedFieldSnapshot, parseBreedFieldSnapshot,
  planBreedNotionFieldDelta, BREED_NOTION_EDITABLE_FIELDS, type BreedFieldSnapshot, type BreedNotionField,
} from "@/lib/notion-breed-field-delta";
import { notionPageBelongsToDataSource } from "@/lib/notion-sync-page-ownership.ts";
import { BREED_NOTION_SCHEMA } from "@/lib/notion-breed-property-registry";
import { manualBreedCellHasValue } from "@/lib/notion-breed-manual-transfer-guards";
import { breedNotionPresentFieldIds } from "@/lib/notion-breed-presence";
import { readNotionStagedBreedField, inspectNotionStagedBreedField, invalidNotionStagedBreedTargets } from "@/lib/notion-breed-stage-read";
import { notionBreedRichTextProperty as notionRichTextProperty, sameBreedSyncValue as sameBreedField } from "@/lib/notion-breed-text";
import { reconcileBreedExtraFields, BREED_EXTRA_FIELDS, readBreedExtraFields, extraValueFromNotion } from "@/lib/notion-breed-extras";
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
  NOTION_BREED_WORKCOPY_SYNC_ENABLED?: string;
  NOTION_BREEDS_WORK_DATA_SOURCE_ID?: string;
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
  /** Only for the one-shot targeted adapter; no source values are exposed. */
  lastErrorCode?: string;
};

const SYNC_ACTOR = "notion-breed-sync@psipedia.sk";
// Includes approved editorial updates for already published canonical breeds.
const MAX_SYNC_ITEMS = 500;
const MAX_EDITORIAL_UPDATES_PER_SWEEP = 25;

function checkboxProperty(page: NotionPage, name: string) {
  return notionPropertyRecord(page, name)?.checkbox === true;
}

/** Explicitly filled Notion cells only, for owner-confirmed one-shot transfers.
 * Empty numbers, text, URLs or JSON staging cells are not clear instructions.
 * Normal automatic sync keeps its existing independent presence semantics.
 */
function manualBreedPresentFieldIds(page:NotionPage):Set<BreedNotionField>{
  const declared=breedNotionPresentFieldIds(page);
  const filled=new Set<BreedNotionField>();
  for(const spec of BREED_NOTION_SCHEMA){
    if(spec.mode!=="content"||!declared.has(spec.id))continue;
    let value:unknown;
    if(spec.type==="number")value=notionNumberProperty(page,spec.notion);
    else if(spec.type==="checkbox")value=checkboxProperty(page,spec.notion);
    else if(spec.type==="url")value=notionUrlProperty(page,spec.notion);
    else if(spec.type==="date")value=notionDateStartProperty(page,spec.notion);
    else if(spec.type==="select")value=notionSelectProperty(page,spec.notion);
    else if(spec.type==="title")value=notionTitleProperty(page,spec.notion);
    else value=notionRichTextProperty(page,spec.notion);
    if(manualBreedCellHasValue(spec.type,value,spec.id))filled.add(spec.id as BreedNotionField);
  }
  return filled;
}

function optionalNumber(page: NotionPage, name: string) {
  const value = notionNumberProperty(page, name);
  return value == null ? undefined : value;
}

function splitList(value: string) {
  return value.split(";").map((item) => item.trim()).filter(Boolean).slice(0, 30);
}

function notionRelationIds(page:NotionPage,field:string) {
  const text=notionRichTextProperty(page,field).trim();
  if(!text)return [];
  return [...new Set(text.split(/[;,\s]+/).map(Number)
    .filter(value=>Number.isSafeInteger(value)&&value>0))].slice(0,100);
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
    // A blank individual column is not a deletion and cannot overwrite a
    // nonempty aggregate value or an existing Admin FCI/editorial section.
    // Explicitly filled individual columns still take priority over JSON.
    const filled=readNotionStagedBreedField(page,column);
    if (filled) merged[key]=filled;
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
  // A blank trait staging cell never clears existing Admin traits.
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
    ["Galéria JSON","array","gallery"],
  ] as const){
    const text=notionRichTextProperty(page,property);
    if(!text)continue;
    try{
      const parsed:unknown=JSON.parse(text);
      const valid=kind==="array" ? Array.isArray(parsed) : Boolean(parsed && typeof parsed==="object" && !Array.isArray(parsed));
      if(!valid)invalid.add(field);
    }catch{invalid.add(field);}
  }
  for(const target of invalidNotionStagedBreedTargets(page)){
    const field=BREED_NOTION_SCHEMA.find(spec=>spec.notion===target&&spec.mode==="content");
    if(field)invalid.add(field.id as BreedNotionField);
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
    fciSection: readNotionStagedBreedField(page, "FCI sekcia"),
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
    gallery: optionalStructuredBreedField(page, "Galéria JSON", "array") as ManagedBreedInput["gallery"],
    relatedBreedIds: notionRelationIds(page,"Súvisiace plemená ID"),
    relatedArticleIds: notionRelationIds(page,"Súvisiace články ID"),
    directoryProfileIds: notionRelationIds(page,"Súvisiace profily služieb ID"),
    // Notion stores absolute URLs; D1 stores local /media or /images paths.
    image: notionUrlProperty(page,"Hlavný obrázok URL").startsWith(SITE_URL+"/media/")
      || notionUrlProperty(page,"Hlavný obrázok URL").startsWith(SITE_URL+"/images/")
      ? notionUrlProperty(page,"Hlavný obrázok URL").slice(SITE_URL.length)
      : notionUrlProperty(page,"Hlavný obrázok URL"),
    accent: (["forest","coral","gold","blue"].includes(notionSelectProperty(page,"Farba akcentu"))
      ? notionSelectProperty(page,"Farba akcentu") : "forest") as ManagedBreedInput["accent"],
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
    history: readNotionStagedBreedField(page, "História"),
    exercise: readNotionStagedBreedField(page, "Pohyb"),
    training: readNotionStagedBreedField(page, "Výcvik"),
    health: readNotionStagedBreedField(page, "Zdravie"),
    healthRisks: splitList(notionRichTextProperty(page, "Zdravotné riziká")),
    goodFor: splitList(notionRichTextProperty(page, "Vhodné pre")),
    consider: splitList(notionRichTextProperty(page, "Zvážiť")),
    sources: parseSources(notionRichTextProperty(page, "Zdroje")),
    seo: {
      title: seoTitle,
      description: metaDescription,
      focusKeyword: notionRichTextProperty(page, "SEO focus keyword"),
      ogTitle: notionRichTextProperty(page, "SEO OG title"),
      ogDescription: notionRichTextProperty(page, "SEO OG description"),
      canonicalUrl: notionUrlProperty(page, "SEO canonical URL"),
      noindex: checkboxProperty(page, "SEO noindex"),
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

async function notionBreedSourceHash(page: NotionPage) {
  const basePayload = notionPageToManagedBreedInput(page);
  const sourceUrl = notionUrlProperty(page, "Hlavný obrázok URL");
  const sourcePageUrl = notionUrlProperty(page, "Zdroj obrázka");
  const altText = notionRichTextProperty(page, "Alt text obrázka");
  return sha256Text(JSON.stringify({ basePayload, sourceUrl, sourcePageUrl, altText }));
}




/** Build one Notion PATCH cell for an individual Admin field; never PATCH siblings. */
function breedNotionContentPatch(field:string,value:unknown):Record<string,unknown>{
  const spec=BREED_NOTION_SCHEMA.find(e=>e.id===field&&e.mode==="content");
  if(!spec)throw new Error("BREED_NOTION_FIELD_UNSUPPORTED");
  if(spec.type==="number")return {[spec.notion]:{number:typeof value==="number"?value:null}};
  if(spec.type==="checkbox")return {[spec.notion]:{checkbox:Boolean(value)}};
  if(spec.type==="select"){
    const selected=String(value??"").trim();
    return {[spec.notion]:{select:selected?{name:selected}:null}};
  }
  if(spec.type==="date"){
    const selected=String(value??"").trim();
    return {[spec.notion]:{date:selected?{start:selected}:null}};
  }
  if(spec.type==="url"){
    let url=String(value??"").trim();
    if(field==="image"&&url.startsWith("/"))url=SITE_URL+url;
    return {[spec.notion]:{url:url||null}};
  }
  let stringValue:string;
  if(["sports","gallery","editorial.heroTraits"].includes(field)){
    stringValue=JSON.stringify(value??[]);
  }else if(["relatedBreedIds","relatedArticleIds","directoryProfileIds"].includes(field)){
    stringValue=Array.isArray(value)?value.join("; "):"";
  }else if(["healthRisks","goodFor","consider"].includes(field)){
    stringValue=Array.isArray(value)?value.join("; "):"";
  }else if(field==="sources"){
    stringValue=Array.isArray(value)?value.map(item=>{
      const entry=item as {label?:string;url?:string};
      return String(entry.label??"")+"|"+String(entry.url??"");
    }).join("; "):"";
  }else{
    stringValue=String(value??"");
  }
  return {[spec.notion]:richTextNotionValue(stringValue,spec.type==="title"?"title":"rich_text")};
}

/**
 * Fully mapped Admin -> Notion editorial writeback. Writes only fields edited
 * in Admin, on both published and draft profiles. Concurrent independent
 * Notion edits are not blocked by a whole-page hash: explicit Admin wins,
 * otherwise remote Notion wins *only for the particular contested field*.
 */
export async function writeBackBreedEditorialToNotion(args:{
  database:D1Database;bindings:NotionBreedSyncBindings;
  before:ManagedBreed;breed:ManagedBreed;
  changedFieldKeys?:readonly string[];
  baselineSnapshot?:BreedFieldSnapshot;
  forceFieldKeys?:readonly string[];
  /** Manual Admin → Notion confirmation; still validates page/ID and echoes. */
  ownerConfirmedOverwrite?:boolean;
}){
  if (notionFlagEnabled(args.bindings.NOTION_BREED_WORKCOPY_SYNC_ENABLED)) {
    if (notionFlagEnabled(args.bindings.NOTION_BREED_SYNC_ENABLED))
      throw Error("BREED_DUAL_SYNCHRONIZERS_FORBIDDEN");
    return writeBackBreedToWorkCopy({
      database: args.database, bindings: args.bindings,
      before: args.before, breed: args.breed,
      changedFieldKeys: args.changedFieldKeys,
      forceFieldKeys: args.forceFieldKeys,
    });
  }
  if(!notionFlagEnabled(args.bindings.NOTION_BREED_SYNC_ENABLED))
    return {linked:false,updated:false,reason:"disabled" as const};
  if(args.before.id!==args.breed.id||args.before.slug!==args.breed.slug)
    throw new Error("BREED_NOTION_WRITEBACK_IDENTITY_MISMATCH");
  const mapping=await args.database.prepare(
    "SELECT notion_page_id,content_hash FROM breed_notion_sync WHERE breed_id=? LIMIT 1"
  ).bind(args.breed.id).first<{notion_page_id:string;content_hash:string}>();
  if(!mapping)return {linked:false,updated:false,reason:"not-linked" as const};
  const sourceId=args.bindings.NOTION_BREEDS_DATA_SOURCE_ID?.trim()??"";
  const page=await notionRequest<NotionPage>(args.bindings,
    "/pages/"+encodeURIComponent(mapping.notion_page_id));
  if(page.id!==mapping.notion_page_id ||
    !notionPageBelongsToDataSource(page,sourceId)||
    notionRichTextProperty(page,"Psipedia ID")!==String(args.breed.id))
    throw new Error("BREED_NOTION_WRITEBACK_IDENTITY_MISMATCH");
  const authorities=await readNotionFieldAuthorities(args.database,"breeds");
  const before=args.baselineSnapshot??breedFieldSnapshot(args.before);
  const after=breedFieldSnapshot(args.breed);
  const remote=breedFieldSnapshot(notionPageToManagedBreedInput(page));
  const historical=decodeBreedReceipt(mapping.content_hash);
  const oldNotion=historical.notion??before;
  const oldAdmin=historical.admin??before;
  const changed=(args.changedFieldKeys??BREED_NOTION_EDITABLE_FIELDS)
    .filter((key):key is BreedNotionField=>BREED_NOTION_EDITABLE_FIELDS.includes(key as BreedNotionField))
    .filter(key=>args.forceFieldKeys?.includes(key)||!sameBreedField(before[key],after[key]));
  if(!changed.length)return {linked:true,updated:false,reason:"no-mirrored-field-change" as const};
  const patch:Record<string,unknown>={};
  const queued:Array<{field:string;properties:Record<string,unknown>}>=[];
  const acknowledged:string[]=[];
  const pending:string[]=[];
  for(const field of changed){
    // When a canonical Notion cell already contains migrated legacy sections,
    // blindly writing the Admin copy would erase those sections. Keep only
    // this field pending; unrelated fields still sync independently.
    const notionTarget=BREED_NOTION_SCHEMA.find(spec=>spec.id===field&&spec.mode==="content")?.notion;
    if(notionTarget && inspectNotionStagedBreedField(page,notionTarget).staged){
      pending.push(field);
      console.warn("notion_breed_staged_field_writeback_deferred",{
        breedId:args.breed.id,field,code:"STAGED_NOTION_CUTOVER_PENDING",
      });
      continue;
    }
    const remoteChanged=!sameBreedField(remote[field],oldNotion[field])
      &&!sameBreedField(remote[field],after[field]);
    if(remoteChanged&&!args.ownerConfirmedOverwrite&&authorities[field]!=="admin"){
      // The owner's Notion priority (or the documented fallback) is resolved
      // on the next inbound sweep. Do not turn it into a manual profile lock.
      pending.push(field);continue;
    }
    try {
      const properties=breedNotionContentPatch(field,after[field]);
      Object.assign(patch,properties);
      queued.push({field,properties});
    } catch (error) {
      // A malformed or oversized source cell must not block unrelated Admin
      // edits; keep this cell pending for a later retry.
      pending.push(field);
      console.warn("notion_breed_field_writeback_pending", {
        breedId: args.breed.id, field,
        code: error instanceof Error ? error.message : "INVALID_FIELD",
      });
    }
  }
  let written=page;
  if(queued.length){
    const submit=async(properties:Record<string,unknown>)=>{
      const result=await notionRequest<NotionPage>(args.bindings,
        "/pages/"+encodeURIComponent(page.id),{
          method:"PATCH",body:JSON.stringify({properties}),
        });
      if(result.id!==page.id||!result.properties)
        throw new Error("BREED_NOTION_WRITEBACK_UNCONFIRMED");
      return result;
    };
    try {
      written=await submit(patch);
      const confirmed: Record<string, unknown> = breedFieldSnapshot(notionPageToManagedBreedInput(written));
      for(const {field} of queued){
        if(sameBreedField(confirmed[field],after[field]))acknowledged.push(field);
        else pending.push(field);
      }
    }catch(error){
      // A malformed Notion property should not block unrelated fields.
      // Only split a provider validation error; never multiply 429/5xx retries.
      const reason=error instanceof Error?error.message:"";
      if(!reason.startsWith("Notion API 400:")||queued.length<2)throw error;
      for(const {field,properties} of queued){
        try {
          const next=await submit(properties);
          const confirmed: Record<string, unknown> = breedFieldSnapshot(notionPageToManagedBreedInput(next));
          written=next;
          if(sameBreedField(confirmed[field],after[field]))acknowledged.push(field);
          else pending.push(field);
        }catch(fieldError){
          const fieldReason=fieldError instanceof Error?fieldError.message:"";
          if(!fieldReason.startsWith("Notion API 400:"))throw fieldError;
          pending.push(field);
          console.warn("notion_breed_field_writeback_pending",{
            breedId:args.breed.id,field,code:"NOTION_VALIDATION_FAILED",
          });
        }
      }
    }
  }
  // Remember only successfully acknowledged fields; rejected fields are
  // still visible to the next retry and cannot disappear in the receipt.
  const now=new Date().toISOString();
  const newRemote=breedFieldSnapshot(notionPageToManagedBreedInput(written));
  const nextNotion={...oldNotion};
  const nextAdmin={...oldAdmin};
  for(const field of acknowledged){
    nextNotion[field]=newRemote[field];
    nextAdmin[field]=after[field];
  }
  await upsertMapping(args.database,written,args.breed.id,
    await notionBreedSourceHash(written),now,{notion:nextNotion,admin:nextAdmin});
  await updateNotionSyncState(args.bindings,page.id,{
    state:pending.length?"Čaká na sync":"Synchronizované",
    error:"",psipediaId:args.breed.id,...(!pending.length?{syncedAt:now}:{}),
  });
  return {linked:true,updated:acknowledged.length>0,reason:pending.length?"pending":undefined,
    pendingFields:pending};
}

/** Kept as a public alias for the existing editor and API integrations. */
export async function writeBackDraftBreedEditorialToNotion(args:{
  database:D1Database;bindings:NotionBreedSyncBindings;
  before:ManagedBreed;breed:ManagedBreed;
}){
  return writeBackBreedEditorialToNotion(args);
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
  "seo.focusKeyword": "SEO focus keyword",
  "seo.ogTitle": "SEO OG title",
  "seo.ogDescription": "SEO OG description",
  "seo.canonicalUrl": "SEO canonical URL",
  "seo.noindex": "SEO noindex",
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
  requireComplete=false,
):Promise<"updated"|"unchanged">{
  const safe=planSafeBreedFields(existing,plan,invalidFields,validateNotionBreedCandidate);
  const now=new Date().toISOString();
  // Images are an ordinary independent field. A broken remote image must
  // not prevent accepted health, FCI, SEO or any other field from transferring.
  let imageUrl=existing.image;
  let imageKey=existing.imageKey;
  let replacedImageKeys:string[]=[];
  if(safe.accepted.includes("image")){
    const source=notionUrlProperty(page,"Hlavný obrázok URL");
    try{
      if(!source){
        imageUrl="";imageKey=null;
      }else if(source===existing.image || source===SITE_URL+existing.image){
        imageUrl=existing.image;imageKey=existing.imageKey;
      }else{
        const prepared=await prepareNotionMainImage({
          bindings,sourceUrl:source,
          sourcePageUrl:notionUrlProperty(page,"Zdroj obrázka"),
          altText:notionRichTextProperty(page,"Alt text obrázka"),
          folder:"breeds",existingImageUrl:existing.image,existingImageKey:existing.imageKey,
        });
        imageUrl=prepared.imageUrl??"";imageKey=prepared.imageKey??null;
        replacedImageKeys=prepared.replacedKeys;
      }
    }catch(error){
      safe.accepted.splice(safe.accepted.indexOf("image"),1);
      safe.skipped.push({field:"image",error:error instanceof Error?error.message:"Obrázok sa nepodarilo načítať"});
    }
  }
  const candidate={...safe.candidate,status:existing.status,image:imageUrl,imageKey};
  const actuallyChanged=JSON.stringify(breedFieldSnapshot(candidate))
    !==JSON.stringify(breedFieldSnapshot(existing))
    ||imageKey!==existing.imageKey;
  const updated=actuallyChanged
    ? await updateManagedBreed(existing.id,candidate,SYNC_ACTOR,existing.updatedAt,
        {preserveUnchangedInvalid:existing})
    : existing;
  if(!updated)throw new Error("BREED_PARTIAL_UPDATE_FAILED");
  if(actuallyChanged&&replacedImageKeys.length)
    await cleanupNotionImageKeys(bindings.BUCKET,replacedImageKeys);
  const ignored=plan.changed.filter(key=>authority[key]==="admin");
  const notionReceipt=partialBreedNotionReceipt(previousNotion,latestNotion,safe.accepted);
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
  // A selected Admin winner must be mirrored to Notion, not merely
  // ignored on inbound. Failure is automatically retried by later sweeps.
  if(ignored.length){
    try {
      await writeBackBreedEditorialToNotion({
        database,bindings,before:updated,breed:updated,
        changedFieldKeys:ignored,forceFieldKeys:ignored,
      });
    }catch(e){
      console.warn("notion_breed_admin_authority_writeback_retry",{
        notionPageId:page.id,breedId:updated.id,
        code:e instanceof Error?e.message:"REMOTE_WRITEBACK_FAILED",
      });
    }
  }
  if(error)console.warn(JSON.stringify({
    event:"notion_breed_partial_sync",notionPageId:page.id,breedId:updated.id,
    accepted:safe.accepted,skipped:safe.skipped,
  }));
  if(requireComplete && safe.skipped.length)
    throw Error("TRANSFER_BREED_PARTIAL_FIELDS");
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
  manualDirection?: ManualFieldDirection,
): Promise<"created" | "updated" | "unchanged"> {
  const basePayload = notionPageToManagedBreedInput(page);
  const presentBreedFields = breedNotionPresentFieldIds(page);
  const contentHash = await notionBreedSourceHash(page);
  const mapping = await loadMapping(database, page.id);
  const now = new Date().toISOString();
  const recovered = mapping ? null : await findUnmappedCanonicalBreed(database, page, basePayload);
  const current = mapping ? await getManagedBreed(Number(mapping.breed_id)) : recovered;
  // These five Notion-only fields are mirrored into D1 without blocking
  // independent content changes.
  if(current && mapping){
    try {
      await reconcileBreedExtraFields({db:database,bindings,page,breedId:current.id,
        priority:manualDirection
          ? Object.fromEntries(BREED_EXTRA_FIELDS.map(f=>[f.id,
            manualDirection==="ADMIN_TO_NOTION"?"admin":"notion"])) as Record<string,NotionFieldMode>
          : authority});
    }catch(e){
      console.warn("notion_breed_extras_retry_needed",{
        breedId:current.id,code:e instanceof Error?e.message:"EXTRA_FIELDS_RETRY",
      });
    }
  }
  // D1 breed_id is the stable join key after the one-time identity check.
  if (mapping) {
    const claimed = notionRichTextProperty(page, "Psipedia ID").trim();
    if (claimed && claimed !== String(mapping.breed_id))
      throw new Error("BREED_PSID_CONFLICT");
  }
  // Do not turn unapproved, unmapped Notion concepts into canonical records.
  if (!mapping && !current && notionSelectProperty(page, "Stav") === "Na kontrolu") return "unchanged";
  // Already linked profiles always accept normal editorial changes. Notion
  // approval is only a creation/first-import concern, never a text lock.
  validateReady(page, Boolean(mapping || current?.status === "published"));
  // Backfill can safely link Research / Na kontrolu identities, but must not
  // treat that act of pairing as editorial approval. Hold the one-time initial
  // content import until this existing profile is explicitly Ready.
  const approvedForFirstImport = ["Ready", "Publikované"].includes(notionSelectProperty(page, "Stav"))
    || checkboxProperty(page, "Profil skvalitnený");
  if ((mapping?.content_hash.startsWith("identity-pending-editorial:") || recovered)
    && !approvedForFirstImport) return "unchanged";

  if (manualDirection && !mapping)throw Error("TRANSFER_BREED_NOT_LINKED");
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
    if(manualDirection){
      // Repair historical differences even if a stale receipt said "DONE".
      // Media and relations require special adapters, not text overwrites.
      const special=new Set(["image","gallery","relatedBreedIds",
        "relatedArticleIds","directoryProfileIds"]);
      const admin=breedFieldSnapshot(existing);
      const remote=breedFieldSnapshot(basePayload);
      const manuallyFilled=manualBreedPresentFieldIds(page);
      const selected=BREED_NOTION_EDITABLE_FIELDS.filter(key=>
        manuallyFilled.has(key)&&!special.has(key));
      if(manualDirection==="ADMIN_TO_NOTION"){
        const output=await writeBackBreedEditorialToNotion({
          database,bindings,before:existing,breed:existing,
          changedFieldKeys:selected,forceFieldKeys:selected,
          ownerConfirmedOverwrite:true,
        });
        if(!output.linked)throw Error("TRANSFER_BREED_NOT_LINKED");
        if("pendingFields" in output && output.pendingFields?.length)
          throw Error("TRANSFER_BREED_PENDING_FIELDS");
        return output.updated?"updated":"unchanged";
      }
      const forced={...remote};
      for(const key of selected)forced[key]=admin[key];
      const plan=planBreedNotionFieldDelta(existing,basePayload,forced,admin,{},new Set(selected));
      // Do not let malformed *unselected* aggregates or gallery JSON fail
      // an otherwise safe manual content transfer. Special adapters handle
      // gallery/relations separately; per-field validation remains enabled.
      const invalidSelected=new Set([...invalidStructuredBreedFields(page)]
        .filter(field=>selected.includes(field)));
      return applySafeBreedSync(database,bindings,page,existing,plan,
        forced,admin,remote,{},contentHash,invalidSelected,true);
    }
    // A later Admin edit is not an acknowledgement from Notion. Never
    // mark its old snapshot "synchronized" or pull an older remote version
    // on top of the unacknowledged D1 revision.
    // Automatically retry unsent Admin changes for every mapped content field,
    // not only the old draft text subset.
    if(mapping && fieldReceipt && receipt.hash===contentHash){
      const liveAdmin=breedFieldSnapshot(existing);
      const unsent=BREED_NOTION_EDITABLE_FIELDS.filter(field=>
        !sameBreedField(liveAdmin[field],fieldReceipt.admin[field]));
      if(unsent.length){
        const result=await writeBackBreedEditorialToNotion({
          database,bindings,before:existing,breed:existing,
          baselineSnapshot:fieldReceipt.admin,changedFieldKeys:unsent,
        });
        if(result.updated)return "updated";
      }
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
      if (invalidStructuredBreedFields(page).has(explicitField)) throw new Error("BREED_STAGED_FIELD_REQUIRES_REVIEW");
      const actualHash = await sha256Text(JSON.stringify(breedFieldSnapshot(basePayload)[explicitField]) ?? "null");
      if (actualHash !== expectedNotionHash) throw new Error("BREED_EXPLICIT_REMOTE_CHANGED");
      // The manually confirmed Notion value and correct breed ID are enough;
      // a newer unrelated Admin edit is not a reason to block this field.
      const oldNotionSnapshot = breedFieldSnapshot(basePayload);
      const oldAdminSnapshot = breedFieldSnapshot(existing);
      oldNotionSnapshot[explicitField] = oldAdminSnapshot[explicitField];
      const plan = planBreedNotionFieldDelta(existing, basePayload,
        oldNotionSnapshot, oldAdminSnapshot, authority, presentBreedFields);
      if (plan.conflicts.length) throw new Error("BREED_EXPLICIT_FIELD_CONFLICT");
      const patch = plan.patch;
      const merged = { ...existing, ...patch, seo:{...existing.seo,...(patch.seo??{})},
        fciStandard:{...existing.fciStandard,...(patch.fciStandard??{})},
        editorial:{...existing.editorial,...(patch.editorial??{})},
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
        fieldReceipt.notion,fieldReceipt.admin,authority,presentBreedFields);
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

    // Legacy SHA receipts have no field history. Do not block a whole breed
    // awaiting a signed property event or a manual historical baseline.
    // A matching hash means Notion did not change: initialise the receipt.
    // On a changed hash, use signed property IDs when available; otherwise
    // compare the current Notion and Admin values and apply the owner's
    // configured per-field priorities. Identity is checked above.
    if (mapping && !fieldReceipt
      && !mapping.content_hash.startsWith("identity-pending-editorial:")) {
      if (receipt.hash === contentHash) {
        await upsertMapping(database, page, existing.id, contentHash, now, {
          notion: breedFieldSnapshot(basePayload),
          admin: breedFieldSnapshot(existing),
        });
        await updateNotionSyncState(bindings, page.id, {
          state: "Synchronizované", psipediaId: existing.id, syncedAt: now,
        });
        return "unchanged";
      }
      const previousAdmin = breedFieldSnapshot(existing);
      const latestNotion = breedFieldSnapshot(basePayload);
      const previousNotion = { ...latestNotion };
      const touched = changedPropertyIds.length
        ? signedBreedChangedFields(page, changedPropertyIds) : [];
      // No webhook IDs is a normal hourly replay, not a conflict.
      // No verified old baseline exists, so differing values are ordinary
      // first-reconciliation candidates resolved by field priority.
      const fields = touched.length ? touched : BREED_NOTION_EDITABLE_FIELDS.filter(field=>{
        if (!presentBreedFields.has(field)) return false;
        const remote=latestNotion[field];
        // First replay of a legacy receipt has no proof that a blank Notion
        // value represents a recent deletion. Baseline it as-is rather than
        // erasing existing photos, relations or editorial text on every breed.
        // Once baselined, explicit future clears are ordinary field changes.
        if(authority[field]==="notion")return true;
        return remote!==null && remote!==undefined && remote!==""
          && !(Array.isArray(remote)&&remote.length===0);
      });
      for (const field of fields) previousNotion[field] = previousAdmin[field];
      const plan = planBreedNotionFieldDelta(
        existing, basePayload, previousNotion, previousAdmin, authority, presentBreedFields,
      );
      return applySafeBreedSync(
        database, bindings, page, existing, plan, previousNotion,
        previousAdmin, plan.latest, authority, contentHash,
        invalidStructuredBreedFields(page),
      );
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
        previousAdmin,previousAdmin,authority,presentBreedFields);
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
  /** Explicit one-page, linked-profile transfer direction. */
  manualDirection?: ManualFieldDirection;
}): Promise<NotionBreedSyncSummary> {
  if (notionFlagEnabled(args.bindings.NOTION_BREED_WORKCOPY_SYNC_ENABLED))
    throw Error("BREED_OLD_SWEEP_DISABLED_IN_WORKCOPY_MODE");
  const summary: NotionBreedSyncSummary = {
    enabled: notionFlagEnabled(args.bindings.NOTION_BREED_SYNC_ENABLED),
    scanned: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    failed: 0,
  };
  if (!summary.enabled) return summary;
  if(args.manualDirection && (!args.targetPageId || args.explicitField))
    throw Error("TRANSFER_BREED_SCOPE_INVALID");

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
    if (await notionPageMustSkipInboundSync(args.database,page.id)) {summary.unchanged += 1;continue;}
    summary.scanned += 1;
    try {
      const result = await syncOneBreed(args.database, args.bindings, page,
        args.changedPropertyIds ?? [], authority, args.explicitField, args.expectedNotionHash,
        args.manualDirection);
      summary[result] += 1;
    } catch (error) {
      summary.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      if(args.manualDirection)
        summary.lastErrorCode=/^[A-Z][A-Z0-9_]{2,100}$/.test(message)
          ?message:"TRANSFER_BREED_ADAPTER_FAILED";
      console.error(JSON.stringify({
        event: "notion_breed_sync_failed",
        notionPageId: page.id,
        error: message,
      }));
      // applySafeBreedSync can commit accepted fields and then report
      // rejected siblings. Keep its detailed field diagnostic in Notion;
      // the owner-confirmed queue will read back every field, marking any
      // remaining mismatches FAILED instead of hiding them behind one code.
      if(args.manualDirection&&message==="TRANSFER_BREED_PARTIAL_FIELDS")continue;
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
  breed: Pick<ManagedBreed, "id" | "slug" | "status" | "publishedAt" | "fciGroup">;
}) {
  if (notionFlagEnabled(args.bindings.NOTION_BREED_WORKCOPY_SYNC_ENABLED)) {
    if (notionFlagEnabled(args.bindings.NOTION_BREED_SYNC_ENABLED))
      throw Error("BREED_DUAL_SYNCHRONIZERS_FORBIDDEN");
    // Publication is D1-owned; the 60+2 Notion source has no Stav or URL Psipedia.
    return { linked: false, updated: false, reason: "workcopy-publication-d1-owned" as const };
  }
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
  const publicUrl = `${SITE_URL}${breedProfileHref(args.breed.slug, args.breed.fciGroup)}`;
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


/** Read-only current-value inspection for owner-confirmed one-shot transfers. */
export async function inspectManualBreedProfile(input:{
  database:D1Database;bindings:NotionBreedSyncBindings;profileId:number;pageId:string;
}):Promise<{notion:Record<string,unknown>;admin:Record<string,unknown>;excluded:string[]}>{
  const expected=await input.database.prepare(
    "SELECT notion_page_id FROM breed_notion_sync WHERE breed_id=? LIMIT 1"
  ).bind(input.profileId).first<{notion_page_id:string}>();
  if(expected?.notion_page_id!==input.pageId)throw Error("TRANSFER_IDENTITY_CHANGED");
  const adminBreed=await getManagedBreed(input.profileId);
  if(!adminBreed)throw Error("TRANSFER_BREED_NOT_FOUND");
  const page=await notionRequest<NotionPage>(
    input.bindings,"/pages/"+encodeURIComponent(input.pageId));
  if(page.id!==input.pageId||!notionPageBelongsToDataSource(
    page,input.bindings.NOTION_BREEDS_DATA_SOURCE_ID??"")
    ||notionRichTextProperty(page,"Psipedia ID")!==String(input.profileId))
    throw Error("TRANSFER_BREED_IDENTITY_MISMATCH");
  const parsed=notionPageToManagedBreedInput(page);
  if(parsed.slug!==adminBreed.slug
    ||(parsed.fciNumber!=null&&adminBreed.fciNumber!=null
      &&parsed.fciNumber!==adminBreed.fciNumber))
    throw Error("TRANSFER_BREED_IDENTITY_MISMATCH");
  const present=manualBreedPresentFieldIds(page);
  const remote=breedFieldSnapshot(parsed);
  const notion:Record<string,unknown>={};
  for(const id of present)if(Object.prototype.hasOwnProperty.call(remote,id))
    notion[id]=remote[id as keyof typeof remote];
  const admin:Record<string,unknown>={...breedFieldSnapshot(adminBreed),
    ...await readBreedExtraFields(input.database,input.profileId)};
  for(const spec of BREED_EXTRA_FIELDS)
    if(Object.prototype.hasOwnProperty.call(page.properties??{},spec.notion))
      notion[spec.id]=extraValueFromNotion(page,spec.id);
  return {notion,admin,excluded:[
    "image","gallery","relatedBreedIds","relatedArticleIds","directoryProfileIds",
  ]};
}
