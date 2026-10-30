import {
  createManagedBreed,
  getManagedBreed,
  updateManagedBreed,
  type ManagedBreed,
  type ManagedBreedInput,
} from "@/lib/breed-store";
import { SITE_URL } from "@/config/public-site";
import { mergeNotionBreedInput } from "@/lib/breed-sync-preservation";
import {
  advanceBreedAdminReceipt, breedFieldSnapshot, parseBreedFieldSnapshot,
  planBreedNotionFieldDelta, explicitBreedFieldPatch,
  type BreedFieldSnapshot, type BreedNotionField,
} from "@/lib/notion-breed-field-delta";
import { notionPageBelongsToDataSource } from "@/lib/notion-sync-page-ownership.ts";
import { breedFieldsFromNotionEvent } from "@/lib/notion-breed-event-fields";
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

async function syncOneBreed(
  database: D1Database,
  bindings: NotionBreedSyncBindings,
  page: NotionPage,
  options: { changedPropertyIds?: readonly string[]; forceFields?: readonly BreedNotionField[] } = {},
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

    // Legacy SHA-only receipts cannot prove a page-wide delta. On the first
    // signed webhook use ONLY the editorial property IDs included by Notion.
    // A deliberately clicked Admin retry may explicitly select one field.
    const explicitlyChanged = options.forceFields?.length
      ? [...options.forceFields]
      : !fieldReceipt && mapping && !mapping.content_hash.startsWith("identity-pending-editorial:")
        ? breedFieldsFromNotionEvent(page, options.changedPropertyIds)
        : [];
    if (mapping && explicitlyChanged.length) {
      const isOwnerRetry=Boolean(options.forceFields?.length);
      const {patch,accepted,conflicts}=explicitBreedFieldPatch(basePayload,explicitlyChanged);
      if (conflicts.length) throw new Error("BREED_FIELD_VALUE_INVALID: "+conflicts.join(","));
      const currentFields=breedFieldSnapshot(existing);
      const wantedFields=breedFieldSnapshot({...existing,...patch,
        seo:{...existing.seo,...(patch.seo??{})}});
      const reallyDifferent=accepted.some(key=>JSON.stringify(currentFields[key])!==JSON.stringify(wantedFields[key]));
      // For an OLD mapping without field receipts we cannot distinguish a
      // concurrent Admin edit in the same field: refuse an automatic write
      // when the Admin record is newer than the last confirmed sync.
      if (!isOwnerRetry && reallyDifferent && Number.isFinite(lastAck)
        && Number.isFinite(adminEdit) && adminEdit>lastAck+2_000)
        throw new Error("BREED_LEGACY_FIELD_OWNER_REVIEW_REQUIRED");
      let updated=existing;
      if (reallyDifferent) {
        const merged={...existing,...patch,
          seo:{...existing.seo,...(patch.seo??{})},
          status:existing.status,editorialComplete:existing.editorialComplete,
          image:existing.image,imageKey:existing.imageKey,
          gallery:existing.gallery,accent:existing.accent} satisfies ManagedBreedInput;
        updated=await updateManagedBreed(existing.id,merged,SYNC_ACTOR,existing.updatedAt);
        if(!updated)throw new Error("BREED_EXPLICIT_FIELD_UPDATE_FAILED");
      }
      const latest=breedFieldSnapshot(basePayload);
      const notionReceipt=fieldReceipt?{...fieldReceipt.notion}:latest;
      const adminReceipt=fieldReceipt?{...fieldReceipt.admin}:breedFieldSnapshot(updated);
      const applied=breedFieldSnapshot(updated);
      for(const key of accepted){notionReceipt[key]=latest[key];adminReceipt[key]=applied[key];}
      await upsertMapping(database,page,updated.id,contentHash,new Date().toISOString(),{
        notion:notionReceipt,admin:adminReceipt,
      });
      await updateNotionSyncState(bindings,page.id,{
        state:"Synchronizované",psipediaId:updated.id,syncedAt:now,
      });
      return reallyDifferent?"updated":"unchanged";
    }

    if (mapping && fieldReceipt) {
      const plan = planBreedNotionFieldDelta(existing, basePayload, fieldReceipt.notion, fieldReceipt.admin);
      if (plan.conflicts.length)
        throw new Error("BREED_SAME_FIELD_CONFLICT: " + plan.conflicts.join(", "));
      if (!plan.changed.length || !Object.keys(plan.patch).length) {
        if (receipt.hash !== contentHash
          || notionSelectProperty(page, "Sync stav") !== "Synchronizované"
          || notionRichTextProperty(page, "Psipedia ID") !== String(existing.id)) {
          await upsertMapping(database, page, existing.id, contentHash, now, {
            notion: plan.latest,
            admin: advanceBreedAdminReceipt(fieldReceipt.admin, existing, plan.accepted),
          });
          await updateNotionSyncState(bindings, page.id, {
            state: "Synchronizované", psipediaId: existing.id, syncedAt: now,
          });
        }
        return "unchanged";
      }
      const merged = {
        ...existing,
        ...plan.patch,
        seo: { ...existing.seo, ...(plan.patch.seo ?? {}) },
        status: existing.status,
        image: existing.image,
        imageKey: existing.imageKey,
        gallery: existing.gallery,
        accent: existing.accent,
        editorialComplete: existing.editorialComplete,
      } satisfies ManagedBreedInput;
      const updated = await updateManagedBreed(existing.id, merged, SYNC_ACTOR, existing.updatedAt);
      if (!updated) throw new Error("BREED_FIELD_UPDATE_FAILED");
      await upsertMapping(database, page, updated.id, contentHash, new Date().toISOString(), {
        notion: plan.latest,
        admin: advanceBreedAdminReceipt(fieldReceipt.admin, updated, plan.accepted),
      });
      await updateNotionSyncState(bindings, page.id, {
        state: "Synchronizované", psipediaId: updated.id, syncedAt: now,
      });
      return "updated";
    }

    // A legacy linked row has only a whole-page SHA; establish a baseline
    // rather than guessing which fields changed before this upgrade.
    if (mapping && !fieldReceipt
      && !mapping.content_hash.startsWith("identity-pending-editorial:")) {
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
      const updated = await updateManagedBreed(existing.id, {
        ...mergedPayload,
        status: existing.status,
        editorialComplete: existing.editorialComplete,
        accent: existing.accent,
        image: existing.image,
        imageKey: existing.imageKey,
        gallery: existing.gallery,
      }, SYNC_ACTOR, existing.updatedAt);
      if (!updated) throw new Error("BREED_PUBLISHED_UPDATE_FAILED");
      await upsertMapping(database, page, updated.id, contentHash, new Date().toISOString(), {
        notion: breedFieldSnapshot(basePayload), admin: breedFieldSnapshot(updated),
      });
      await updateNotionSyncState(bindings, page.id, {
        state: "Synchronizované", psipediaId: updated.id, syncedAt: now,
      });
      return "updated";
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
  forceFields?: readonly BreedNotionField[];
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
      const result = await syncOneBreed(args.database, args.bindings, page, {
        changedPropertyIds:args.changedPropertyIds,
        forceFields:args.forceFields,
      });
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
