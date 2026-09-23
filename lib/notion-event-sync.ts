import { SITE_URL } from "@/config/public-site";
import {
  createManagedEvent,
  getManagedEventById,
  updateManagedEvent,
  type ManagedEventInput,
} from "@/lib/event-store";
import type { DogEvent } from "@/lib/events";
import {
  cleanupNotionImageKeys,
  listReadyNotionPages,
  notionDateStartProperty,
  notionFlagEnabled,
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

export type NotionEventSyncBindings = NotionSyncBindings & {
  NOTION_EVENT_SYNC_ENABLED?: string;
  NOTION_EVENTS_DATA_SOURCE_ID?: string;
};

type EventMappingRow = {
  event_id: number;
  content_hash: string;
  inbound_locked_at: string | null;
  inbound_lock_reason: string | null;
};

export type NotionEventSyncSummary = {
  enabled: boolean;
  scanned: number;
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
};

const SYNC_ACTOR = "notion-event-sync@psipedia.sk";
const MAX_SYNC_ITEMS = 100;

function checkboxProperty(page: NotionPage, name: string) {
  return notionPropertyRecord(page, name)?.checkbox === true;
}

function dateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : "";
}

export function notionPageToManagedEventInput(page: NotionPage): ManagedEventInput {
  const title = notionTitleProperty(page, "Názov");
  const slug = notionRichTextProperty(page, "Slug");
  if (!title) throw new Error("Doplň v Notione názov podujatia.");
  if (!slug) throw new Error("Doplň v Notione slug podujatia.");

  const seoTitle = notionRichTextProperty(page, "SEO title");
  const metaDescription = notionRichTextProperty(page, "Meta description");

  return {
    title,
    slug,
    status: "draft",
    excerpt: notionRichTextProperty(page, "Perex"),
    eventType: notionRichTextProperty(page, "Typ podujatia"),
    startDate: dateOnly(notionDateStartProperty(page, "Začiatok")),
    startTime: notionRichTextProperty(page, "Čas začiatku"),
    endDate: dateOnly(notionDateStartProperty(page, "Koniec")) || null,
    endTime: notionRichTextProperty(page, "Čas konca") || null,
    venue: notionRichTextProperty(page, "Miesto"),
    city: notionRichTextProperty(page, "Mesto"),
    region: notionRichTextProperty(page, "Kraj"),
    address: notionRichTextProperty(page, "Adresa"),
    organizer: notionRichTextProperty(page, "Organizátor"),
    description: notionRichTextProperty(page, "Popis"),
    practicalInfo: notionRichTextProperty(page, "Praktické info"),
    websiteUrl: notionUrlProperty(page, "Web") || null,
    registrationUrl: notionUrlProperty(page, "Registrácia") || null,
    cancelled: checkboxProperty(page, "Zrušené"),
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
    throw new Error("Podujatie nie je v stave Ready na automatický prenos do adminu.");
  }
}

async function loadMapping(database: D1Database, pageId: string) {
  return database.prepare(
    "SELECT event_id, content_hash, inbound_locked_at, inbound_lock_reason FROM event_notion_sync WHERE notion_page_id = ? LIMIT 1",
  ).bind(pageId).first<EventMappingRow>();
}

async function upsertMapping(
  database: D1Database,
  page: NotionPage,
  eventId: number,
  contentHash: string,
  now: string,
) {
  await database.prepare(`
    INSERT INTO event_notion_sync (
      notion_page_id, event_id, notion_last_edited_time, content_hash, last_synced_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(notion_page_id) DO UPDATE SET
      event_id = excluded.event_id,
      notion_last_edited_time = excluded.notion_last_edited_time,
      content_hash = excluded.content_hash,
      last_synced_at = excluded.last_synced_at,
      updated_at = excluded.updated_at
  `).bind(
    page.id,
    eventId,
    page.last_edited_time ?? null,
    contentHash,
    now,
    now,
    now,
  ).run();
}

async function assertNoUnmappedDuplicate(database: D1Database, payload: ManagedEventInput) {
  const slug = String(payload.slug ?? "");
  const duplicate = await database.prepare(
    "SELECT id, slug, status FROM managed_events WHERE slug = ? LIMIT 1",
  ).bind(slug).first<{ id: number; slug: string; status: string }>();

  if (duplicate) {
    throw new Error(
      `Podujatie už v Psipedii existuje (ID ${duplicate.id}, slug ${duplicate.slug}). Automatický sync nevytvorí duplicitu; existujúci záznam treba najprv explicitne prepojiť.`,
    );
  }
}

async function preparePayloadWithImage(
  bindings: NotionEventSyncBindings,
  page: NotionPage,
  basePayload: ManagedEventInput,
  existing?: DogEvent | null,
) {
  const sourceUrl = notionUrlProperty(page, "Hlavný obrázok URL");
  const prepared = await prepareNotionMainImage({
    bindings,
    sourceUrl,
    sourcePageUrl: notionUrlProperty(page, "Zdroj obrázka"),
    altText: notionRichTextProperty(page, "Alt text obrázka"),
    folder: "events",
    existingImageUrl: existing?.imageUrl ?? null,
    existingImageKey: existing?.imageKey ?? null,
  });

  return {
    payload: {
      ...basePayload,
      imageUrl: prepared.imageUrl,
      imageKey: prepared.imageKey,
      seo: {
        ...(basePayload.seo ?? {}),
        ogImage: prepared.imageUrl ?? "",
      },
    } satisfies ManagedEventInput,
    prepared,
  };
}

async function syncOneEvent(
  database: D1Database,
  bindings: NotionEventSyncBindings,
  page: NotionPage,
): Promise<"created" | "updated" | "unchanged"> {
  validateReady(page);
  const basePayload = notionPageToManagedEventInput(page);
  const sourceUrl = notionUrlProperty(page, "Hlavný obrázok URL");
  const sourcePageUrl = notionUrlProperty(page, "Zdroj obrázka");
  const altText = notionRichTextProperty(page, "Alt text obrázka");
  const contentHash = await sha256Text(JSON.stringify({ basePayload, sourceUrl, sourcePageUrl, altText }));
  const mapping = await loadMapping(database, page.id);
  const now = new Date().toISOString();

  if (mapping) {
    const existing = await getManagedEventById(Number(mapping.event_id));
    if (!existing) {
      throw new Error("Notion záznam je prepojený na chýbajúce podujatie v Psipedii.");
    }
    if (mapping.inbound_locked_at) {
      throw new Error("Prepojené podujatie má schválenú Partner úpravu. Canonical D1 má prednosť a automatický Notion sync ho nebude prepisovať.");
    }
    if (existing.status !== "draft") {
      throw new Error("Prepojené podujatie už nie je Draft. Automatický sync ho nebude prepisovať ani odpublikovávať.");
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
      const updated = await updateManagedEvent(existing.id, payload, SYNC_ACTOR, existing);
      if (!updated) throw new Error("Prepojené podujatie sa nepodarilo aktualizovať.");
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
    const created = await createManagedEvent(payload, SYNC_ACTOR);
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

export async function runNotionEventSyncSweep(args: {
  database: D1Database;
  bindings: NotionEventSyncBindings;
}): Promise<NotionEventSyncSummary> {
  const summary: NotionEventSyncSummary = {
    enabled: notionFlagEnabled(args.bindings.NOTION_EVENT_SYNC_ENABLED),
    scanned: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    failed: 0,
  };
  if (!summary.enabled) return summary;

  const dataSourceId = args.bindings.NOTION_EVENTS_DATA_SOURCE_ID?.trim();
  if (!dataSourceId) throw new Error("NOTION_EVENTS_DATA_SOURCE_ID nie je nakonfigurovaný.");

  const pages = await listReadyNotionPages(args.bindings, dataSourceId, MAX_SYNC_ITEMS);
  summary.scanned = pages.length;

  for (const page of pages) {
    try {
      const result = await syncOneEvent(args.database, args.bindings, page);
      summary[result] += 1;
    } catch (error) {
      summary.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(JSON.stringify({
        event: "notion_event_sync_failed",
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
          event: "notion_event_sync_writeback_failed",
          notionPageId: page.id,
          error: writeBackError instanceof Error ? writeBackError.message : String(writeBackError),
        }));
      }
    }
  }

  return summary;
}

export async function writeBackPublishedEventToNotion(args: {
  database: D1Database;
  bindings: NotionEventSyncBindings;
  event: Pick<DogEvent, "id" | "slug" | "status" | "publishedAt">;
}) {
  if (!notionFlagEnabled(args.bindings.NOTION_EVENT_SYNC_ENABLED)) {
    return { linked: false, updated: false, reason: "disabled" as const };
  }
  if (args.event.status !== "published") {
    return { linked: false, updated: false, reason: "not-published" as const };
  }

  const mapping = await args.database.prepare(
    "SELECT notion_page_id FROM event_notion_sync WHERE event_id = ? LIMIT 1",
  ).bind(args.event.id).first<{ notion_page_id: string }>();
  if (!mapping?.notion_page_id) {
    return { linked: false, updated: false, reason: "not-linked" as const };
  }

  const now = new Date().toISOString();
  const publicUrl = `${SITE_URL}/podujatia/${args.event.slug}`;
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
    "UPDATE event_notion_sync SET last_synced_at = ?, updated_at = ? WHERE notion_page_id = ?",
  ).bind(now, now, mapping.notion_page_id).run();

  return { linked: true, updated: true, notionPageId: mapping.notion_page_id, publicUrl };
}
