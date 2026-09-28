import {
  createManagedBreed,
  getManagedBreed,
  updateManagedBreed,
  type ManagedBreed,
  type ManagedBreedInput,
} from "@/lib/breed-store";
import { SITE_URL } from "@/config/public-site";
import {
  cleanupNotionImageKeys,
  listReadyNotionPages,
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
};

export type NotionBreedSyncSummary = {
  enabled: boolean;
  scanned: number;
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
};

const SYNC_ACTOR = "notion-breed-sync@psipedia.sk";
const MAX_SYNC_ITEMS = 100;

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
    editorialComplete: checkboxProperty(page, "Editorial complete"),
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

function validateReady(page: NotionPage) {
  if (notionSelectProperty(page, "Stav") !== "Ready") {
    throw new Error("Plemeno nie je v stave Ready na automatický prenos do adminu.");
  }
}

async function loadMapping(database: D1Database, pageId: string) {
  return database.prepare(
    "SELECT breed_id, content_hash FROM breed_notion_sync WHERE notion_page_id = ? LIMIT 1",
  ).bind(pageId).first<BreedMappingRow>();
}

async function upsertMapping(
  database: D1Database,
  page: NotionPage,
  breedId: number,
  contentHash: string,
  now: string,
) {
  await database.prepare(`
    INSERT INTO breed_notion_sync (
      notion_page_id, breed_id, notion_last_edited_time, content_hash, last_synced_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(notion_page_id) DO UPDATE SET
      breed_id = excluded.breed_id,
      notion_last_edited_time = excluded.notion_last_edited_time,
      content_hash = excluded.content_hash,
      last_synced_at = excluded.last_synced_at,
      updated_at = excluded.updated_at
  `).bind(
    page.id,
    breedId,
    page.last_edited_time ?? null,
    contentHash,
    now,
    now,
    now,
  ).run();
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
        ogImage: prepared.imageUrl ?? "",
      },
    } satisfies ManagedBreedInput,
    prepared,
  };
}

async function syncOneBreed(
  database: D1Database,
  bindings: NotionBreedSyncBindings,
  page: NotionPage,
): Promise<"created" | "updated" | "unchanged"> {
  validateReady(page);
  const basePayload = notionPageToManagedBreedInput(page);
  const sourceUrl = notionUrlProperty(page, "Hlavný obrázok URL");
  const sourcePageUrl = notionUrlProperty(page, "Zdroj obrázka");
  const altText = notionRichTextProperty(page, "Alt text obrázka");
  const contentHash = await sha256Text(JSON.stringify({ basePayload, sourceUrl, sourcePageUrl, altText }));
  const mapping = await loadMapping(database, page.id);
  const now = new Date().toISOString();

  if (mapping) {
    const existing = await getManagedBreed(Number(mapping.breed_id));
    if (!existing) {
      throw new Error("Notion záznam je prepojený na chýbajúce plemeno v Psipedii.");
    }
    if (existing.status !== "draft") {
      throw new Error("Prepojené plemeno už nie je Draft. Automatický sync ho nebude prepisovať ani odpublikovávať.");
    }

    if (mapping.content_hash === contentHash) {
      await upsertMapping(database, page, existing.id, contentHash, now);
      await updateNotionSyncState(bindings, page.id, {
        state: "Synchronizované",
        psipediaId: existing.id,
        syncedAt: now,
      });
      return "unchanged";
    }

    const { payload, prepared } = await preparePayloadWithImage(bindings, page, basePayload, existing);
    try {
      const updated = await updateManagedBreed(existing.id, payload, SYNC_ACTOR);
      if (!updated) throw new Error("Prepojené plemeno sa nepodarilo aktualizovať.");
      await cleanupNotionImageKeys(bindings.BUCKET, prepared.replacedKeys);
      await upsertMapping(database, page, updated.id, contentHash, now);
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

  await assertNoUnmappedDuplicate(database, basePayload);
  const { payload, prepared } = await preparePayloadWithImage(bindings, page, basePayload);
  try {
    const created = await createManagedBreed(payload, SYNC_ACTOR);
    if (!created) throw new Error("Plemeno sa nepodarilo vytvoriť.");
    await upsertMapping(database, page, created.id, contentHash, now);
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

  const pages = await listReadyNotionPages(args.bindings, dataSourceId, MAX_SYNC_ITEMS);
  summary.scanned = pages.length;

  for (const page of pages) {
    try {
      const result = await syncOneBreed(args.database, args.bindings, page);
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
