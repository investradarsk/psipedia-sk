import {
  createManagedArticle,
  deleteManagedArticle,
  getManagedArticleById,
  isArticleSlugConflict,
  updateManagedArticle,
  type ManagedArticle,
  type ManagedArticleInput,
} from "@/lib/article-store";
import type { ArticleBlock } from "@/lib/article-blocks";
import { articleHref } from "@/lib/portal";
import {
  isCompatibleLegacyArticleSubsection,
  resolveCanonicalArticleSubsection,
} from "@/lib/article-subsection-taxonomy";
import { SITE_URL } from "@/config/public-site";

export type NotionSyncBindings = {
  NOTION_ARTICLE_SYNC_ENABLED?: string;
  NOTION_API_TOKEN?: string;
  NOTION_ARTICLES_DATA_SOURCE_ID?: string;
  BUCKET?: R2Bucket;
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
const MAX_SYNC_ITEMS = 100;
const MAX_REMOTE_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_REMOTE_IMAGE_REDIRECTS = 3;
const REMOTE_IMAGE_ACCEPT = "image/avif,image/webp,image/png,image/jpeg";
const WIKIMEDIA_USER_AGENT = "PsipediaBot/1.0 (https://psipedia.sk/kontakt)";
const REMOTE_IMAGE_EXTENSIONS = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
]);

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

function urlProperty(page: NotionPage, name: string) {
  const value = propertyRecord(page, name)?.url;
  return typeof value === "string" ? value.trim() : "";
}

function selectProperty(page: NotionPage, name: string) {
  const select = propertyRecord(page, name)?.select;
  return select && typeof select === "object" && typeof (select as Record<string, unknown>).name === "string"
    ? String((select as Record<string, unknown>).name)
    : "";
}


function safeRemoteImageUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Hlavný obrázok URL nie je platná webová adresa.");
  }

  if (url.protocol !== "https:") {
    throw new Error("Hlavný obrázok musí používať HTTPS adresu.");
  }
  if (url.username || url.password || (url.port && url.port !== "443")) {
    throw new Error("Hlavný obrázok URL obsahuje nepovolené prihlasovacie údaje alebo port.");
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  const isIpv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
  const isIpv6 = hostname.includes(":");
  if (
    !hostname
    || hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname.endsWith(".local")
    || hostname.endsWith(".internal")
    || isIpv4
    || isIpv6
  ) {
    throw new Error("Hlavný obrázok URL musí smerovať na verejnú HTTPS doménu.");
  }

  return url;
}

function detectedRemoteImageType(bytes: Uint8Array) {
  const decoder = new TextDecoder();
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8
    && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte)
  ) return "image/png";
  if (
    bytes.length >= 12
    && decoder.decode(bytes.slice(0, 4)) === "RIFF"
    && decoder.decode(bytes.slice(8, 12)) === "WEBP"
  ) return "image/webp";
  if (bytes.length >= 16 && decoder.decode(bytes.slice(4, 8)) === "ftyp") {
    const brands = decoder.decode(bytes.slice(8, Math.min(bytes.length, 40)));
    if (brands.includes("avif") || brands.includes("avis")) return "image/avif";
  }
  return null;
}

async function readRemoteImageBody(response: Response) {
  if (!response.body) throw new Error("Zdroj hlavného obrázka nevrátil dáta.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      total += value.byteLength;
      if (total > MAX_REMOTE_IMAGE_BYTES) {
        await reader.cancel();
        throw new Error("Hlavný obrázok môže mať najviac 8 MB.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function remoteImageHeaders(url: URL) {
  const headers = new Headers({ Accept: REMOTE_IMAGE_ACCEPT });
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const isWikimedia = hostname === "wikimedia.org"
    || hostname.endsWith(".wikimedia.org")
    || hostname === "wikipedia.org"
    || hostname.endsWith(".wikipedia.org");

  if (isWikimedia) {
    headers.set("User-Agent", WIKIMEDIA_USER_AGENT);
    headers.set("Api-User-Agent", WIKIMEDIA_USER_AGENT);
  }

  return headers;
}

async function downloadRemoteImage(sourceUrl: string) {
  let url = safeRemoteImageUrl(sourceUrl);

  for (let redirectCount = 0; redirectCount <= MAX_REMOTE_IMAGE_REDIRECTS; redirectCount += 1) {
    const response = await fetch(url.toString(), {
      redirect: "manual",
      headers: remoteImageHeaders(url),
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirectCount >= MAX_REMOTE_IMAGE_REDIRECTS) {
        throw new Error("Hlavný obrázok má príliš veľa presmerovaní.");
      }
      const location = response.headers.get("location");
      if (!location) throw new Error("Presmerovanie hlavného obrázka nemá cieľovú adresu.");
      url = safeRemoteImageUrl(new URL(location, url).toString());
      continue;
    }

    if (!response.ok) {
      throw new Error(`Hlavný obrázok sa nepodarilo stiahnuť (HTTP ${response.status}).`);
    }

    const declaredLength = Number(response.headers.get("content-length") || "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REMOTE_IMAGE_BYTES) {
      throw new Error("Hlavný obrázok môže mať najviac 8 MB.");
    }

    const bytes = await readRemoteImageBody(response);
    const contentType = detectedRemoteImageType(bytes);
    const extension = contentType ? REMOTE_IMAGE_EXTENSIONS.get(contentType) : null;
    if (!contentType || !extension) {
      throw new Error("Hlavný obrázok musí byť JPG, PNG, WebP alebo AVIF.");
    }
    return { bytes, contentType, extension };
  }

  throw new Error("Hlavný obrázok sa nepodarilo stiahnuť.");
}

function storedImageUrl(imageKey: string | null | undefined) {
  return imageKey ? `/media/${imageKey}` : null;
}

type PreparedNotionImage = {
  payload: ManagedArticleInput;
  uploadedKey: string | null;
  replacedKeys: string[];
};

async function prepareNotionMainImage(
  bindings: NotionSyncBindings,
  page: NotionPage,
  payload: ManagedArticleInput,
  existing?: ManagedArticle | null,
): Promise<PreparedNotionImage> {
  const sourceUrl = urlProperty(page, "Hlavný obrázok URL");

  if (!sourceUrl) {
    if (!existing) return { payload, uploadedKey: null, replacedKeys: [] };
    const existingImageUrl = existing.image ?? storedImageUrl(existing.imageKey);
    const existingOgImageUrl = existing.seo?.ogImage ?? storedImageUrl(existing.ogImageKey) ?? existingImageUrl;
    return {
      payload: {
        ...payload,
        imageUrl: existingImageUrl,
        imageKey: existing.imageKey,
        ogImageUrl: existingOgImageUrl,
        ogImageKey: existing.ogImageKey,
      },
      uploadedKey: null,
      replacedKeys: [],
    };
  }

  const bucket = bindings.BUCKET;
  if (!bucket) {
    throw new Error("Cloudflare R2 úložisko nie je pripojené; hlavný obrázok sa nedá synchronizovať.");
  }

  const sourceFingerprint = await sha256(sourceUrl);

  if (existing?.imageKey) {
    const currentObject = await bucket.head(existing.imageKey);
    if (currentObject?.customMetadata?.notionSourceHash === sourceFingerprint) {
      const existingImageUrl = existing.image ?? storedImageUrl(existing.imageKey);
      const existingOgImageUrl = existing.seo?.ogImage ?? storedImageUrl(existing.ogImageKey) ?? existingImageUrl;
      return {
        payload: {
          ...payload,
          imageUrl: existingImageUrl,
          imageKey: existing.imageKey,
          ogImageUrl: existingOgImageUrl,
          ogImageKey: existing.ogImageKey ?? existing.imageKey,
        },
        uploadedKey: null,
        replacedKeys: [],
      };
    }
  }

  const remote = await downloadRemoteImage(sourceUrl);
  const key = `articles/${new Date().getUTCFullYear()}/${crypto.randomUUID()}.${remote.extension}`;
  const imageUrl = storedImageUrl(key);
  const imageSourceUrl = urlProperty(page, "Zdroj obrázka");
  const altText = richTextProperty(page, "Alt text obrázka");

  await bucket.put(key, remote.bytes, {
    httpMetadata: {
      contentType: remote.contentType,
      cacheControl: "public, max-age=31536000, immutable",
    },
    customMetadata: {
      source: "notion-sync",
      notionSourceHash: sourceFingerprint,
      notionSourceUrl: sourceUrl.slice(0, 400),
      imageSourceUrl: imageSourceUrl.slice(0, 400),
      altText: altText.slice(0, 250),
    },
  });

  const replacedKeys = [...new Set(
    [existing?.imageKey, existing?.ogImageKey]
      .filter((value): value is string => Boolean(value) && value !== key),
  )];

  return {
    payload: {
      ...payload,
      imageUrl,
      imageKey: key,
      ogImageUrl: imageUrl,
      ogImageKey: key,
    },
    uploadedKey: key,
    replacedKeys,
  };
}

async function cleanupImageKeys(bucket: R2Bucket | undefined, keys: Array<string | null | undefined>) {
  if (!bucket) return;
  const unique = [...new Set(keys.filter((value): value is string => Boolean(value)))];
  await Promise.all(unique.map((key) => bucket.delete(key).catch(() => undefined)));
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

type NotionArticlePlacement = {
  category: NonNullable<ManagedArticleInput["category"]>;
  portalSection: NonNullable<ManagedArticleInput["portalSection"]>;
  portalSubpage?: string | null;
  newsCategory?: string | null;
};

type ExistingNotionArticlePlacement = Pick<
  ManagedArticle,
  "category" | "portalSection" | "portalSubpage" | "newsCategory"
>;

const LEGACY_UNAMBIGUOUS_CATEGORY_PLACEMENTS: Record<string, NotionArticlePlacement> = {
  "Výživa": {
    category: "Výživa",
    portalSection: "starostlivost",
    portalSubpage: "vyziva",
  },
  "Správanie": {
    category: "Život so psom",
    portalSection: "starostlivost",
    portalSubpage: "spravanie",
  },
  "Plemená": {
    category: "Život so psom",
    portalSection: "clanky",
  },
  "Pomoc psom": {
    category: "Život so psom",
    portalSection: "clanky",
  },
  "Bezpečnosť": {
    category: "Život so psom",
    portalSection: "clanky",
  },
  "Zaujímavosti": {
    category: "Život so psom",
    portalSection: "clanky",
  },
};

function notionNewsCategory(notionCategory: string) {
  if (notionCategory === "Zaujímavosti") return "zaujimavosti";
  if (notionCategory === "Zdravie a starostlivosť" || notionCategory === "Výživa") return "veda-a-zdravie";
  if (notionCategory === "Pomoc psom") return "zachrana-a-hrdinovia";
  if (notionCategory === "Bezpečnosť") return "ochrana-a-pravo";
  return "zo-sveta";
}

function preservedLegacyPlacement(
  notionCategory: string,
  existing?: ExistingNotionArticlePlacement,
): NotionArticlePlacement | null {
  if (!existing || !isCompatibleLegacyArticleSubsection(
    notionCategory,
    existing.portalSection,
    existing.portalSubpage,
  )) {
    return null;
  }
  return {
    category: existing.category,
    portalSection: existing.portalSection,
    portalSubpage: existing.portalSubpage ?? null,
    newsCategory: existing.newsCategory ?? null,
  };
}

function mapNotionPlacement(
  notionCategory: string,
  notionSubsection: string,
  contentType: string,
  existing?: ExistingNotionArticlePlacement,
): NotionArticlePlacement {
  if (notionSubsection) {
    const canonical = resolveCanonicalArticleSubsection(notionCategory, notionSubsection);
    if (contentType === "Aktuálna novinka" && canonical.portalSection !== "novinky") {
      throw new Error("Aktuálna novinka musí používať sekciu „Novinky zo sveta psov“ a platnú Podsekciu.");
    }
    if (contentType === "Recenzia" && canonical.portalSection !== "recenzie") {
      throw new Error("Recenzia musí používať sekciu „Recenzie a testy“ a platnú Podsekciu.");
    }
    return {
      category: canonical.category,
      portalSection: canonical.portalSection,
      portalSubpage: canonical.portalSection === "novinky" ? null : canonical.portalSubpage,
      newsCategory: canonical.newsCategory,
    };
  }

  if (contentType === "Aktuálna novinka" || notionCategory === "Novinky zo sveta psov") {
    return {
      category: "Život so psom",
      portalSection: "novinky",
      newsCategory: notionNewsCategory(notionCategory),
    };
  }

  if (contentType === "Recenzia" || notionCategory === "Recenzie a testy") {
    const preserved = preservedLegacyPlacement("Recenzie a testy", existing);
    if (preserved) return preserved;
    throw new Error("Doplň v Notione Podsekciu pre sekciu „Recenzie a testy“. Sync nevymyslí náhradnú route.");
  }

  const legacy = LEGACY_UNAMBIGUOUS_CATEGORY_PLACEMENTS[notionCategory];
  if (legacy) return legacy;

  const preserved = preservedLegacyPlacement(notionCategory, existing);
  if (preserved) return preserved;

  if (
    notionCategory === "Zdravie a starostlivosť"
    || notionCategory === "Výcvik a aktivity"
    || notionCategory === "Šteniatka"
  ) {
    throw new Error(`Doplň v Notione Podsekciu pre sekciu „${notionCategory}“. Sync je pri nejednoznačnom umiestnení fail-closed.`);
  }

  throw new Error(`Kategória „${notionCategory}“ nemá bezpečné canonical article mapping.`);
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

export function notionPageToManagedArticleInput(
  page: NotionPage,
  blocks: NotionBlock[],
  existing?: ExistingNotionArticlePlacement,
): ManagedArticleInput {
  const title = titleProperty(page, "Názov");
  const slug = richTextProperty(page, "Slug");
  const notionCategory = selectProperty(page, "Kategória");
  const notionSubsection = selectProperty(page, "Podsekcia");
  const contentType = selectProperty(page, "Typ obsahu");
  const metaDescription = richTextProperty(page, "Meta description");
  const seoTitle = richTextProperty(page, "SEO title");
  const focusKeyword = richTextProperty(page, "Hlavné kľúčové slovo");
  const { intro, blocks: articleBlocks } = convertBodyBlocks(blocks);

  if (!title) throw new Error("Doplň v Notione názov článku.");
  if (!slug) throw new Error("Doplň v Notione slug článku.");
  if (!notionCategory) throw new Error("Doplň v Notione kategóriu článku.");

  const excerpt = metaDescription.length >= 20 ? metaDescription : intro;
  const placement = mapNotionPlacement(notionCategory, notionSubsection, contentType, existing);
  return {
    title,
    slug,
    excerpt,
    category: placement.category,
    portalSection: placement.portalSection,
    portalSubpage: placement.portalSubpage ?? null,
    newsCategory: placement.newsCategory ?? null,
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

function validateSyncGate(page: NotionPage) {
  if (selectProperty(page, "Stav") !== "Ready") {
    throw new Error("Článok nie je v stave Ready na automatický prenos do adminu.");
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
          filter: { property: "Stav", select: { equals: "Ready" } },
          sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
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


export async function writeBackPublishedArticleToNotion(args: {
  database: D1Database;
  bindings: NotionSyncBindings;
  article: {
    id: number;
    slug: string;
    portalSection: string;
    status: string;
    publishedAt: string | null;
  };
}) {
  if (!flagEnabled(args.bindings.NOTION_ARTICLE_SYNC_ENABLED)) {
    return { linked: false, updated: false, reason: "disabled" as const };
  }
  if (args.article.status !== "published") {
    return { linked: false, updated: false, reason: "not-published" as const };
  }

  const mapping = await args.database.prepare(
    "SELECT notion_page_id FROM article_notion_sync WHERE article_id = ? LIMIT 1",
  ).bind(args.article.id).first<{ notion_page_id: string }>();

  if (!mapping?.notion_page_id) {
    return { linked: false, updated: false, reason: "not-linked" as const };
  }

  const now = new Date().toISOString();
  const publishedAt = args.article.publishedAt ?? now;
  const publicUrl = `${SITE_URL}${articleHref({
    slug: args.article.slug,
    portalSection: args.article.portalSection,
  })}`;

  await notionRequest(
    args.bindings,
    `/pages/${encodeURIComponent(mapping.notion_page_id)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        properties: {
          "Stav": { select: { name: "Publikované" } },
          "Dátum publikácie": { date: { start: publishedAt } },
          "URL Psipedia": { url: publicUrl },
          "Sync stav": { select: { name: "Synchronizované" } },
          "Sync chyba": notionTextValue(""),
          "Posledný sync": { date: { start: now } },
        },
      }),
    },
  );

  await args.database.prepare(
    "UPDATE article_notion_sync SET last_synced_at = ?, updated_at = ? WHERE notion_page_id = ?",
  ).bind(now, now, mapping.notion_page_id).run();

  return {
    linked: true,
    updated: true,
    notionPageId: mapping.notion_page_id,
    publicUrl,
  };
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
  validateSyncGate(page);
  const blocks = await getPageBlocks(bindings, page.id);
  const mapping = await loadMapping(database, page.id);
  let existing: ManagedArticle | null = null;

  if (mapping) {
    existing = await getManagedArticleById(Number(mapping.article_id));
    if (!existing) {
      throw new Error("Notion záznam je prepojený na chýbajúci článok v Psipedii. Synchronizácia bola zastavená.");
    }
    if (existing.status !== "draft") {
      throw new Error("Prepojený článok už nie je Draft. Automatická synchronizácia ho nebude prepisovať ani odpublikovávať.");
    }
  }

  const basePayload = notionPageToManagedArticleInput(page, blocks, existing ?? undefined);
  const notionImageSourceUrl = urlProperty(page, "Hlavný obrázok URL");
  const contentHash = await sha256(JSON.stringify({ payload: basePayload, notionImageSourceUrl }));
  const now = new Date().toISOString();

  if (mapping && existing) {
    if (mapping.content_hash === contentHash) {
      await upsertMapping(database, page, existing.id, contentHash, now);
      await updateNotionSyncState(bindings, page.id, {
        state: "Synchronizované",
        articleId: existing.id,
        syncedAt: now,
      });
      return "unchanged";
    }

    const prepared = await prepareNotionMainImage(bindings, page, basePayload, existing);
    let updated: Awaited<ReturnType<typeof updateManagedArticle>> | null = null;
    try {
      updated = await updateManagedArticle(existing.id, prepared.payload, SYNC_ACTOR, existing);
    } catch (error) {
      await cleanupImageKeys(bindings.BUCKET, [prepared.uploadedKey]);
      throw error;
    }
    if (!updated) {
      await cleanupImageKeys(bindings.BUCKET, [prepared.uploadedKey]);
      throw new Error("Prepojený článok sa nepodarilo aktualizovať.");
    }
    await cleanupImageKeys(bindings.BUCKET, prepared.replacedKeys);
    await upsertMapping(database, page, updated.id, contentHash, now);
    await updateNotionSyncState(bindings, page.id, {
      state: "Synchronizované",
      articleId: updated.id,
      syncedAt: now,
    });
    return "updated";
  }

  const prepared = await prepareNotionMainImage(bindings, page, basePayload);
  let created: Awaited<ReturnType<typeof createManagedArticle>> | null = null;
  try {
    created = await createManagedArticle(prepared.payload, SYNC_ACTOR);
    await upsertMapping(database, page, created.id, contentHash, now);
  } catch (error) {
    if (created) {
      try {
        await deleteManagedArticle(created.id);
      } catch {
        // Keep the original sync failure as the primary error.
      }
    }
    await cleanupImageKeys(bindings.BUCKET, [prepared.uploadedKey]);
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
