import {
  createManagedArticle,
  deleteManagedArticle,
  getManagedArticleById,
  isArticleSlugConflict,
  updateManagedArticle,
  type ManagedArticleInput,
} from "@/lib/article-store";
import type { ArticleBlock } from "@/lib/article-blocks";

type NotionSyncBindings = {
  NOTION_ARTICLE_SYNC_ENABLED?: string;
  NOTION_API_TOKEN?: string;
  NOTION_ARTICLES_DATA_SOURCE_ID?: string;
};

type NotionPage = {
  id: string;
  last_edited_time?: string;
  properties?: Record<string, unknown>;
};

type NotionBlock = {
  id: string;
  type: string;
  [key: string]: unknown;
};

type NotionQueryResponse = {
  results?: NotionPage[];
  has_more?: boolean;
  next_cursor?: string | null;
};

type NotionBlocksResponse = {
  results?: NotionBlock[];
  has_more?: boolean;
  next_cursor?: string | null;
};

type SyncMappingRow = {
  article_id: number;
  content_hash: string;
};

export type NotionArticleSyncSummary = {
  enabled: boolean;
  scanned: number;
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
};

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2025-09-03";
const SYNC_ACTOR = "notion-sync@psipedia.sk";
const MAX_SYNC_ITEMS = 20;

function flagEnabled(value: unknown) {
  return typeof value === "string" && (value === "1" || value.toLowerCase() === "true");
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function richTextPlainText(value: unknown) {
  if (!Array.isArray(value)) return "";
  return normalizeText(value.map((item) => {
    if (!item || typeof item !== "object") return "";
    const record = item as Record<string, unknown>;
    return typeof record.plain_text === "string" ? record.plain_text : "";
  }).join(""));
}

function propertyRecord(page: NotionPage, name: string) {
  const value = page.properties?.[name];
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function titleProperty(page: NotionPage, name: string) {
  return richTextPlainText(propertyRecord(page, name)?.title);
}

function richTextProperty(page: NotionPage, name: string) {
  return richTextPlainText(propertyRecord(page, name)?.rich_text);
}

function selectProperty(page: NotionPage, name: string) {
  const select = propertyRecord(page, name)?.select;
  return select && typeof select === "object" && typeof (select as Record<string, unknown>).name === "string"
    ? String((select as Record<string, unknown>).name)
    : "";
}

function checkboxProperty(page: NotionPage, name: string) {
  return propertyRecord(page, name)?.checkbox === true;
}

function blockPayload(block: NotionBlock) {
  const value = block[block.type];
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function blockText(block: NotionBlock) {
  return richTextPlainText(blockPayload(block)?.rich_text);
}

function notionBlockId(block: NotionBlock, index: number) {
  return `notion-${block.id || index + 1}`.slice(0, 100);
}

function mapNotionCategory(value: string): ManagedArticleInput["category"] {
  if (value === "Zdravie a starostlivosť") return "Zdravie";
  if (value === "Výcvik a aktivity") return "Výcvik";
  if (value === "Výživa") return "Výživa";
  return "Život so psom";
}

function isStartHeading(value: string) {
  const normalized = normalizeText(value).toLocaleLowerCase("sk");
  return normalized === "článok — draft"
    || normalized === "článok - draft"
    || normalized === "obsah článku"
    || normalized === "osnova článku";
}

function isStopHeading(value: string) {
  return normalizeText(value).toLocaleLowerCase("sk") === "seo";
}

function calloutType(block: NotionBlock): "warning" | "tip" {
  const icon = blockPayload(block)?.icon;
  if (icon && typeof icon === "object" && (icon as Record<string, unknown>).emoji === "⚠️") return "warning";
  return "tip";
}

function convertBodyBlocks(blocks: NotionBlock[]) {
  const start = blocks.findIndex((block) => block.type === "heading_2" && isStartHeading(blockText(block)));
  if (start < 0) {
    throw new Error("V Notion článku chýba sekcia „Článok — draft“ (alebo kompatibilná „Osnova článku“).");
  }

  const selected: NotionBlock[] = [];
  for (let index = start + 1; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block.type === "heading_2" && isStopHeading(blockText(block))) break;
    selected.push(block);
  }

  let intro = "";
  const articleBlocks: ArticleBlock[] = [];
  let listBuffer: { type: "bullet-list" | "numbered-list"; items: string[]; id: string } | null = null;

  const flushList = () => {
    if (!listBuffer) return;
    if (listBuffer.items.length) articleBlocks.push(listBuffer);
    listBuffer = null;
  };

  selected.forEach((block, index) => {
    const text = blockText(block);
    if (!text && block.type !== "divider") return;

    if (block.type === "heading_1") {
      flushList();
      return;
    }

    if (block.type === "bulleted_list_item" || block.type === "numbered_list_item") {
      const type = block.type === "bulleted_list_item" ? "bullet-list" : "numbered-list";
      if (!listBuffer || listBuffer.type !== type) {
        flushList();
        listBuffer = { id: notionBlockId(block, index), type, items: [] };
      }
      if (text) listBuffer.items.push(text);
      return;
    }

    flushList();

    if (block.type === "paragraph") {
      if (!intro && text.length >= 20) {
        intro = text;
        return;
      }
      if (text) articleBlocks.push({ id: notionBlockId(block, index), type: "text", content: text });
      return;
    }
    if (block.type === "heading_2") {
      articleBlocks.push({ id: notionBlockId(block, index), type: "h2", text });
      return;
    }
    if (block.type === "heading_3") {
      articleBlocks.push({ id: notionBlockId(block, index), type: "h3", text });
      return;
    }
    if (block.type === "quote") {
      articleBlocks.push({ id: notionBlockId(block, index), type: "quote", content: text });
      return;
    }
    if (block.type === "callout") {
      articleBlocks.push({ id: notionBlockId(block, index), type: calloutType(block), content: text });
    }
  });
  flushList();

  if (intro.length < 20) {
    throw new Error("Synchronizovaná časť článku potrebuje úvodný odsek s aspoň 20 znakmi.");
  }
  if (!articleBlocks.length) {
    throw new Error("Synchronizovaná časť článku neobsahuje žiadny podporovaný obsahový blok.");
  }
  return { intro, blocks: articleBlocks };
}

function estimateReadingMinutes(intro: string, blocks: ArticleBlock[]) {
  const body = blocks.flatMap((block) => {
    if (block.type === "text" || block.type === "tip" || block.type === "warning" || block.type === "quote") return [block.content];
    if (block.type === "h2" || block.type === "h3") return [block.text];
    if (block.type === "bullet-list" || block.type === "numbered-list") return block.items;
    return [];
  }).join(" ");
  const words = normalizeText(`${intro} ${body}`).split(" ").filter(Boolean).length;
  return Math.max(1, Math.min(60, Math.round(words / 220) || 1));
}

export function notionPageToManagedArticleInput(page: NotionPage, blocks: NotionBlock[]): ManagedArticleInput {
  const title = titleProperty(page, "Názov");
  const slug = richTextProperty(page, "Slug");
  const notionCategory = selectProperty(page, "Kategória");
  const metaDescription = richTextProperty(page, "Meta description");
  const seoTitle = richTextProperty(page, "SEO title");
  const focusKeyword = richTextProperty(page, "Hlavné kľúčové slovo");
  const { intro, blocks: articleBlocks } = convertBodyBlocks(blocks);

  if (!title) throw new Error("Doplň v Notione názov článku.");
  if (!slug) throw new Error("Doplň v Notione slug článku.");
  if (!notionCategory) throw new Error("Doplň v Notione kategóriu článku.");

  const excerpt = metaDescription.length >= 20 ? metaDescription : intro;
  return {
    title,
    slug,
    excerpt,
    category: mapNotionCategory(notionCategory),
    portalSection: "clanky",
    status: "draft",
    accent: "forest",
    author: "Redakcia Psipedia",
    intro,
    takeaway: "",
    sections: [],
    blocks: articleBlocks,
    sources: [],
    readingMinutes: estimateReadingMinutes(intro, articleBlocks),
    publishedAt: null,
    showUpdated: false,
    seoTitle,
    metaDescription,
    canonicalUrl: "",
    noindex: false,
    focusKeyword,
    ogTitle: seoTitle,
    ogDescription: metaDescription,
    relatedBreedIds: [],
  };
}

function validateApprovalGate(page: NotionPage) {
  if (selectProperty(page, "Stav") !== "Ready") throw new Error("Článok nie je v stave Ready.");
  if (!checkboxProperty(page, "Odoslať na Psipedia")) throw new Error("Odoslanie na Psipedia nie je potvrdené.");
  const missing = [
    ["Zdroje overené", checkboxProperty(page, "Zdroje overené")],
    ["Obsah skontrolovaný", checkboxProperty(page, "Obsah skontrolovaný")],
    ["SEO skontrolované", checkboxProperty(page, "SEO skontrolované")],
  ].filter(([, checked]) => !checked).map(([name]) => name);
  if (missing.length) {
    throw new Error(`Pred synchronizáciou potvrď: ${missing.join(", ")}.`);
  }
}

async function notionRequest<T>(
  bindings: NotionSyncBindings,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = bindings.NOTION_API_TOKEN?.trim();
  if (!token) throw new Error("NOTION_API_TOKEN nie je nakonfigurovaný.");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Notion-Version", NOTION_VERSION);
  headers.set("Content-Type", "application/json");
  const response = await fetch(`${NOTION_API_BASE}${path}`, { ...init, headers });
  const text = await response.text();
  if (!response.ok) {
    let message = text.slice(0, 500);
    try {
      const parsed = JSON.parse(text) as { message?: string };
      if (parsed.message) message = parsed.message;
    } catch {
      // Preserve the plain response body.
    }
    throw new Error(`Notion API ${response.status}: ${message}`);
  }
  return text ? JSON.parse(text) as T : {} as T;
}

async function listReadyNotionPages(bindings: NotionSyncBindings) {
  const dataSourceId = bindings.NOTION_ARTICLES_DATA_SOURCE_ID?.trim();
  if (!dataSourceId) throw new Error("NOTION_ARTICLES_DATA_SOURCE_ID nie je nakonfigurovaný.");

  const results: NotionPage[] = [];
  let cursor: string | null = null;
  do {
    const response = await notionRequest<NotionQueryResponse>(
      bindings,
      `/data_sources/${encodeURIComponent(dataSourceId)}/query`,
      {
        method: "POST",
        body: JSON.stringify({
          filter: {
            and: [
              { property: "Stav", select: { equals: "Ready" } },
              { property: "Odoslať na Psipedia", checkbox: { equals: true } },
            ],
          },
          page_size: Math.min(100, MAX_SYNC_ITEMS - results.length),
          ...(cursor ? { start_cursor: cursor } : {}),
        }),
      },
    );
    results.push(...(response.results ?? []));
    cursor = response.has_more && response.next_cursor ? response.next_cursor : null;
  } while (cursor && results.length < MAX_SYNC_ITEMS);
  return results.slice(0, MAX_SYNC_ITEMS);
}

async function getPageBlocks(bindings: NotionSyncBindings, pageId: string) {
  const results: NotionBlock[] = [];
  let cursor: string | null = null;
  do {
    const query = new URLSearchParams({ page_size: "100" });
    if (cursor) query.set("start_cursor", cursor);
    const response = await notionRequest<NotionBlocksResponse>(
      bindings,
      `/blocks/${encodeURIComponent(pageId)}/children?${query.toString()}`,
    );
    results.push(...(response.results ?? []));
    cursor = response.has_more && response.next_cursor ? response.next_cursor : null;
  } while (cursor && results.length < 500);
  return results.slice(0, 500);
}

function notionTextValue(value: string) {
  return { rich_text: value ? [{ type: "text", text: { content: value.slice(0, 1900) } }] : [] };
}

async function updateNotionSyncState(
  bindings: NotionSyncBindings,
  pageId: string,
  values: {
    state: "Synchronizované" | "Chyba";
    articleId?: number;
    error?: string;
    syncedAt?: string;
  },
) {
  const properties: Record<string, unknown> = {
    "Odoslať na Psipedia": { checkbox: false },
    "Sync stav": { select: { name: values.state } },
    "Sync chyba": notionTextValue(values.error ?? ""),
  };
  if (values.articleId) properties["Psipedia ID"] = notionTextValue(String(values.articleId));
  if (values.syncedAt) properties["Posledný sync"] = { date: { start: values.syncedAt } };

  await notionRequest(
    bindings,
    `/pages/${encodeURIComponent(pageId)}`,
    { method: "PATCH", body: JSON.stringify({ properties }) },
  );
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function loadMapping(database: D1Database, pageId: string) {
  return database.prepare(
    "SELECT article_id, content_hash FROM article_notion_sync WHERE notion_page_id = ? LIMIT 1",
  ).bind(pageId).first<SyncMappingRow>();
}

async function upsertMapping(
  database: D1Database,
  page: NotionPage,
  articleId: number,
  contentHash: string,
  now: string,
) {
  await database.prepare(`
    INSERT INTO article_notion_sync (
      notion_page_id, article_id, notion_last_edited_time, content_hash, last_synced_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(notion_page_id) DO UPDATE SET
      article_id = excluded.article_id,
      notion_last_edited_time = excluded.notion_last_edited_time,
      content_hash = excluded.content_hash,
      last_synced_at = excluded.last_synced_at,
      updated_at = excluded.updated_at
  `).bind(
    page.id,
    articleId,
    page.last_edited_time ?? null,
    contentHash,
    now,
    now,
    now,
  ).run();
}

async function syncOneNotionPage(
  database: D1Database,
  bindings: NotionSyncBindings,
  page: NotionPage,
): Promise<"created" | "updated" | "unchanged"> {
  validateApprovalGate(page);
  const blocks = await getPageBlocks(bindings, page.id);
  const payload = notionPageToManagedArticleInput(page, blocks);
  const contentHash = await sha256(JSON.stringify(payload));
  const mapping = await loadMapping(database, page.id);
  const now = new Date().toISOString();

  if (mapping) {
    const existing = await getManagedArticleById(Number(mapping.article_id));
    if (!existing) {
      throw new Error("Notion záznam je prepojený na chýbajúci článok v Psipedii. Synchronizácia bola zastavená.");
    }
    if (existing.status !== "draft") {
      throw new Error("Prepojený článok už nie je Draft. Automatická synchronizácia ho nebude prepisovať ani odpublikovávať.");
    }
    if (mapping.content_hash === contentHash) {
      await upsertMapping(database, page, existing.id, contentHash, now);
      await updateNotionSyncState(bindings, page.id, {
        state: "Synchronizované",
        articleId: existing.id,
        syncedAt: now,
      });
      return "unchanged";
    }

    const updated = await updateManagedArticle(existing.id, payload, SYNC_ACTOR, existing);
    if (!updated) throw new Error("Prepojený článok sa nepodarilo aktualizovať.");
    await upsertMapping(database, page, updated.id, contentHash, now);
    await updateNotionSyncState(bindings, page.id, {
      state: "Synchronizované",
      articleId: updated.id,
      syncedAt: now,
    });
    return "updated";
  }

  let created: Awaited<ReturnType<typeof createManagedArticle>> | null = null;
  try {
    created = await createManagedArticle(payload, SYNC_ACTOR);
    await upsertMapping(database, page, created.id, contentHash, now);
  } catch (error) {
    if (created) {
      try {
        await deleteManagedArticle(created.id);
      } catch {
        // Keep the original sync failure as the primary error.
      }
    }
    if (isArticleSlugConflict(error)) {
      throw new Error("Slug už používa iný článok v Psipedii. Zmeň slug v Notione alebo prepojenie vyrieš ručne.");
    }
    throw error;
  }

  await updateNotionSyncState(bindings, page.id, {
    state: "Synchronizované",
    articleId: created.id,
    syncedAt: now,
  });
  return "created";
}

export async function runNotionArticleSyncSweep(args: {
  database: D1Database;
  bindings: NotionSyncBindings;
}): Promise<NotionArticleSyncSummary> {
  const summary: NotionArticleSyncSummary = {
    enabled: flagEnabled(args.bindings.NOTION_ARTICLE_SYNC_ENABLED),
    scanned: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    failed: 0,
  };
  if (!summary.enabled) return summary;

  const pages = await listReadyNotionPages(args.bindings);
  summary.scanned = pages.length;

  for (const page of pages) {
    try {
      const result = await syncOneNotionPage(args.database, args.bindings, page);
      summary[result] += 1;
    } catch (error) {
      summary.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(JSON.stringify({
        event: "notion_article_sync_failed",
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
          event: "notion_article_sync_writeback_failed",
          notionPageId: page.id,
          error: writeBackError instanceof Error ? writeBackError.message : String(writeBackError),
        }));
      }
    }
  }
  return summary;
}
