import { notionPageMustSkipInboundSync } from "./admin-record-lifecycle";
import { ARTICLE_NOTION_SEO_PROPERTIES as SEO, articleSeoFromNotion, articleSeoExplicitClears, type ArticleSeoRemoteValues } from "./notion-article-seo-properties";
import { decodeArticleSeoReceipt, encodeArticleSeoReceipt } from "./notion-article-seo-receipt";
import { articleSeoChangedFields, articleSeoUnacknowledgedRemoteFields, planArticleSeoIndependentWriteback, projectArticleSeoConfirmedBaseline, verifyArticleSeoPatch, type ArticleSeoFieldFailure } from "./notion-article-seo-writeback";
import { notionRequest as notionSharedRequest } from "@/lib/notion-sync-shared";
import { recordNotionTransfer } from "@/lib/notion-transfer-audit";
import { readNotionFieldAuthorities, type NotionFieldMode } from "@/lib/notion-field-authority";
import {
  createManagedArticle,
  deleteManagedArticle,
  getManagedArticleById,
  getPublishedArticle,
  isArticleSlugConflict,
  updateManagedArticle,
  type ManagedArticle,
  type ManagedArticleInput,
} from "@/lib/article-store";
import { normalizeArticleBlocks, type ArticleBlock } from "@/lib/article-blocks";
import { preserveArticlePromoBlocks } from "@/lib/article-promo";
import { notionArticleMainImageSource } from "@/lib/notion-article-image-source";
import { assertPublishedRelatedBlocks } from "@/lib/notion-article-related-publication";
import {
  EDITORIAL_RICH_TEXT_LEGACY_VERSION,
  sanitizeEditorialHref,
  type EditorialRichTextDocument,
  type EditorialRichTextInline,
  type EditorialRichTextMark,
} from "@/lib/editorial-content";
import { articleHref } from "@/lib/portal";
import {
  buildNotionEditorialPlan,
  notionEditorialBlockShape,
  notionEditorialPropertyText,
  type NotionEditorialPlan,
  type RemoteArticleBlock,
} from "@/lib/notion-article-content-plan";
import {
  isCompatibleLegacyArticleSubsection,
  resolveCanonicalArticleSubsection,
} from "@/lib/article-subsection-taxonomy";
import { SITE_URL } from "@/config/public-site";

export type NotionSyncBindings = {
  NOTION_ARTICLE_SYNC_ENABLED?: string;
  NOTION_ARTICLE_CONTENT_WRITEBACK_ENABLED?: string;
  NOTION_API_TOKEN?: string;
  NOTION_ARTICLES_DATA_SOURCE_ID?: string;
  BUCKET?: R2Bucket;
};

type NotionPage = {
  id: string;
  parent?: { type?: string; data_source_id?: string };
  archived?: boolean;
  in_trash?: boolean;
  last_edited_time?: string;
  properties?: Record<string, unknown>;
};

type NotionBlock = {
  id: string;
  type: string;
  has_children?: boolean;
  children?: NotionBlock[];
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
  last_synced_at: string;
};

export type NotionArticleSyncSummary = {
  enabled: boolean;
  scanned: number;
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
};

const SYNC_ACTOR = "notion-sync@psipedia.sk";
const MAX_SYNC_ITEMS = 100;
const MAX_LEGACY_READY_RECEIPTS_PER_SWEEP = 30;
const MAX_EDITORIAL_UPDATES_PER_SWEEP = 20;
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

function richTextRecords(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    : [];
}

function richTextPlainText(value: unknown) {
  return normalizeText(richTextRecords(value).map((record) => (
    typeof record.plain_text === "string" ? record.plain_text : ""
  )).join(""));
}

function richTextHref(record: Record<string, unknown>) {
  if (typeof record.href === "string") return sanitizeEditorialHref(record.href, true);
  const text = record.text;
  if (!text || typeof text !== "object") return "";
  const link = (text as Record<string, unknown>).link;
  if (!link || typeof link !== "object") return "";
  return sanitizeEditorialHref((link as Record<string, unknown>).url, true);
}

function notionRichTextInline(value: unknown): EditorialRichTextInline[] {
  const nodes: EditorialRichTextInline[] = [];

  for (const record of richTextRecords(value)) {
    const plain = typeof record.plain_text === "string" ? record.plain_text : "";
    if (!plain) continue;

    const annotations = record.annotations && typeof record.annotations === "object"
      ? record.annotations as Record<string, unknown>
      : {};
    const marks: EditorialRichTextMark[] = [];
    if (annotations.bold === true) marks.push({ type: "bold" });
    if (annotations.italic === true) marks.push({ type: "italic" });
    const href = richTextHref(record);
    if (href) marks.push({ type: "link", href });

    plain.split("\n").forEach((part, index) => {
      if (index) nodes.push({ type: "hardBreak" });
      if (part) nodes.push({ type: "text", text: part, ...(marks.length ? { marks } : {}) });
    });
  }

  return nodes;
}

function notionRichTextDocument(
  value: unknown,
  type: "paragraph" | "blockquote" | "callout" = "paragraph",
  tone: "info" | "tip" | "warning" = "info",
): EditorialRichTextDocument | null {
  const content = notionRichTextInline(value);
  if (!content.length) return null;
  const block = type === "paragraph"
    ? { type: "paragraph" as const, content }
    : type === "blockquote"
      ? { type: "blockquote" as const, content }
      : { type: "callout" as const, tone, content };
  return { version: EDITORIAL_RICH_TEXT_LEGACY_VERSION, type: "doc", content: [block] };
}

function notionRichTextMarkdown(value: unknown) {
  return richTextRecords(value).map((record) => {
    const text = typeof record.plain_text === "string" ? record.plain_text : "";
    if (!text) return "";
    const annotations = record.annotations && typeof record.annotations === "object"
      ? record.annotations as Record<string, unknown>
      : {};
    const href = richTextHref(record);

    // Article list/table cells use the lightweight Markdown renderer. Prefer a
    // link over other marks when Notion combines marks that renderer cannot nest.
    if (href) return `[${text}](${href})`;
    if (annotations.bold === true) return `**${text}**`;
    if (annotations.italic === true) return `_${text}_`;
    return text;
  }).join("");
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

function checkboxProperty(page: NotionPage, name: string) {
  return propertyRecord(page, name)?.checkbox === true;
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
  ogImageWasCleared = false,
): Promise<PreparedNotionImage> {
  const source = notionArticleMainImageSource(page);
  const sourceUrl = source.url;
  const imageSourceUrl = urlProperty(page, "Zdroj obrázka");
  const altText = richTextProperty(page, "Alt text obrázka");
  // An explicit OG image belongs to the SEO field and must not be silently
  // replaced by the hero-image fallback during a later Notion image import.
  const explicitOgImage = urlProperty(page, SEO.ogImageUrl.name);
  const oldOgImage = existing?.seo?.ogImage ?? storedImageUrl(existing?.ogImageKey);
  const explicitOgKey = explicitOgImage && oldOgImage && (
    (() => { try {
      return new URL(explicitOgImage, SITE_URL).href === new URL(oldOgImage, SITE_URL).href;
    } catch { return explicitOgImage === oldOgImage; } })()
  ) ? existing?.ogImageKey ?? null : null;

  if (!sourceUrl) {
    if (!existing) return { payload, uploadedKey: null, replacedKeys: [] };
    const existingImageUrl = existing.image ?? storedImageUrl(existing.imageKey);
    const existingOgImageUrl = existing.seo?.ogImage ?? storedImageUrl(existing.ogImageKey) ?? existingImageUrl;
    return {
      payload: {
        ...payload,
        imageUrl: existingImageUrl,
        imageKey: existing.imageKey,
        imageAlt: altText || existing.imageAlt || null,
        imageCreditUrl: imageSourceUrl || existing.imageCreditUrl || null,
        ogImageUrl: ogImageWasCleared ? null : (explicitOgImage || existingOgImageUrl),
        ogImageKey: ogImageWasCleared ? null : (explicitOgImage ? explicitOgKey : existing.ogImageKey),
      },
      uploadedKey: null,
      replacedKeys: [],
    };
  }

  const bucket = bindings.BUCKET;
  if (!bucket) {
    throw new Error("Cloudflare R2 úložisko nie je pripojené; hlavný obrázok sa nedá synchronizovať.");
  }

  // Notion file download URLs expire; use the stable uploaded file ID.
  const sourceFingerprint = await sha256(source.identity);

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
          imageAlt: altText || existing.imageAlt || null,
          imageCreditUrl: imageSourceUrl || existing.imageCreditUrl || null,
          ogImageUrl: ogImageWasCleared ? null : (explicitOgImage || existingOgImageUrl),
          ogImageKey: ogImageWasCleared ? null : (explicitOgImage ? explicitOgKey : existing.ogImageKey ?? existing.imageKey),
        },
        uploadedKey: null,
        replacedKeys: [],
      };
    }
  }

  const remote = await downloadRemoteImage(sourceUrl);
  const key = `articles/${new Date().getUTCFullYear()}/${crypto.randomUUID()}.${remote.extension}`;
  const imageUrl = storedImageUrl(key);
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

  const nextOgImageUrl = ogImageWasCleared ? null : (explicitOgImage || imageUrl);
  const nextOgImageKey = ogImageWasCleared ? null : (explicitOgImage ? explicitOgKey : key);
  const replacedKeys = [...new Set(
    [existing?.imageKey, existing?.ogImageKey]
      .filter((value): value is string => Boolean(value) && value !== key && value !== nextOgImageKey),
  )];

  return {
    payload: {
      ...payload,
      imageUrl,
      imageKey: key,
      imageAlt: altText || null,
      imageCreditUrl: imageSourceUrl || null,
      ogImageUrl: nextOgImageUrl,
      ogImageKey: nextOgImageKey,
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

function blockRichText(block: NotionBlock) {
  return blockPayload(block)?.rich_text;
}

function blockText(block: NotionBlock) {
  return richTextPlainText(blockRichText(block));
}

function notionBlockId(block: NotionBlock, index: number) {
  return `notion-${block.id || index + 1}`.slice(0, 100);
}

function notionExternalBlockUrl(block: NotionBlock) {
  const payload = blockPayload(block);
  if (!payload) return "";
  if (block.type === "embed") return sanitizeEditorialHref(payload.url, false);

  const mediaType = typeof payload.type === "string" ? payload.type : "";
  if (mediaType !== "external") return "";
  const external = payload.external;
  if (!external || typeof external !== "object") return "";
  return sanitizeEditorialHref((external as Record<string, unknown>).url, false);
}

function notionImageBlock(block: NotionBlock, index: number): ArticleBlock | null {
  if (block.type !== "image") return null;
  const url = notionExternalBlockUrl(block);
  if (!url.startsWith("https://")) return null;
  const caption = richTextPlainText(blockPayload(block)?.caption);
  return {
    id: notionBlockId(block, index),
    type: "image",
    url,
    imageKey: null,
    alt: caption || "Ilustračný obrázok k článku",
    ...(caption ? { caption } : {}),
    size: "normal",
  };
}

function notionEmbedBlock(block: NotionBlock, index: number): ArticleBlock | null {
  if (block.type !== "embed" && block.type !== "video") return null;
  const url = notionExternalBlockUrl(block);
  if (!url) return null;
  const caption = richTextPlainText(blockPayload(block)?.caption);
  return {
    id: notionBlockId(block, index),
    type: "embed",
    url,
    ...(caption ? { title: caption, caption } : {}),
  };
}

function notionTableBlock(block: NotionBlock, index: number): ArticleBlock | null {
  if (block.type !== "table") return null;
  const payload = blockPayload(block);
  const rows = (block.children ?? []).flatMap((row) => {
    if (row.type !== "table_row") return [];
    const cells = blockPayload(row)?.cells;
    if (!Array.isArray(cells)) return [];
    return [cells.map((cell) => notionRichTextMarkdown(cell))];
  });
  if (!rows.length) return null;

  const width = Math.max(
    Number(payload?.table_width) || 0,
    ...rows.map((row) => row.length),
  );
  const normalizedRows = rows.map((row) => Array.from({ length: width }, (_, cellIndex) => row[cellIndex] ?? ""));
  const hasColumnHeader = payload?.has_column_header === true;
  const headers = hasColumnHeader
    ? normalizedRows.shift() ?? []
    : Array.from({ length: width }, (_, cellIndex) => `Stĺpec ${cellIndex + 1}`);

  return headers.length ? {
    id: notionBlockId(block, index),
    type: "table",
    headers,
    rows: normalizedRows,
  } : null;
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
> & Partial<Pick<ManagedArticle, "seo" | "ogImageKey">>;

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

function isAdminManifestHeading(value: string) {
  const normalized = normalizeText(value).toLocaleLowerCase("sk");
  return normalized === "psipedia bloky"
    || normalized === "redakčné prvky pre psipedia admin";
}

function calloutType(block: NotionBlock): "warning" | "tip" {
  const icon = blockPayload(block)?.icon;
  if (icon && typeof icon === "object" && (icon as Record<string, unknown>).emoji === "⚠️") return "warning";
  return "tip";
}

type NotionManifestDirective = {
  block: ArticleBlock;
  afterSection?: string;
  beforeHeading?: string;
  position?: "start" | "end";
};

function parseAdminManifest(blocks: NotionBlock[]): NotionManifestDirective[] {
  const start = blocks.findIndex((block) => block.type === "heading_2" && isAdminManifestHeading(blockText(block)));
  if (start < 0) return [];

  const selected: NotionBlock[] = [];
  for (let index = start + 1; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block.type === "heading_2" && !isAdminManifestHeading(blockText(block))) break;
    selected.push(block);
  }

  const manifest = selected.find((block) => {
    if (block.type !== "code") return false;
    const language = blockPayload(block)?.language;
    return language === "json" || language === "javascript" || language === "plain text";
  });
  if (!manifest) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(blockText(manifest));
  } catch {
    throw new Error("Sekcia „Psipedia bloky“ obsahuje neplatný JSON manifest.");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("Sekcia „Psipedia bloky“ musí obsahovať JSON pole blokov.");
  }

  return parsed.slice(0, 100).flatMap((raw, index): NotionManifestDirective[] => {
    if (!raw || typeof raw !== "object") return [];
    const record = raw as Record<string, unknown>;
    const afterSection = typeof record.afterSection === "string" ? normalizeText(record.afterSection) : "";
    const beforeHeading = typeof record.beforeHeading === "string" ? normalizeText(record.beforeHeading) : "";
    const position = record.position === "start" ? "start" : record.position === "end" ? "end" : undefined;
    const input = { ...record };
    delete input.afterSection;
    delete input.beforeHeading;
    delete input.position;

    const [block] = normalizeArticleBlocks([{
      ...input,
      id: `notion-manifest-${manifest.id || "blocks"}-${index + 1}`,
    }]);
    if (!block) return [];

    return [{
      block,
      ...(afterSection ? { afterSection } : {}),
      ...(beforeHeading ? { beforeHeading } : {}),
      ...(position ? { position } : {}),
    }];
  });
}

function placeManifestBlocks(articleBlocks: ArticleBlock[], directives: NotionManifestDirective[]) {
  const result = [...articleBlocks];

  const normalizedHeading = (block: ArticleBlock) => (
    block.type === "h2" || block.type === "h3"
      ? normalizeText(block.text).toLocaleLowerCase("sk")
      : ""
  );

  for (const directive of directives) {
    let insertAt = result.length;

    if (directive.position === "start") {
      insertAt = 0;
    } else if (directive.beforeHeading) {
      const target = directive.beforeHeading.toLocaleLowerCase("sk");
      const headingIndex = result.findIndex((block) => normalizedHeading(block) === target);
      if (headingIndex >= 0) insertAt = headingIndex;
    } else if (directive.afterSection) {
      const target = directive.afterSection.toLocaleLowerCase("sk");
      const headingIndex = result.findIndex((block) => normalizedHeading(block) === target);
      if (headingIndex >= 0) {
        const heading = result[headingIndex];
        const stopTypes = heading.type === "h2" ? new Set(["h2"]) : new Set(["h2", "h3"]);
        insertAt = headingIndex + 1;
        while (insertAt < result.length && !stopTypes.has(result[insertAt].type)) insertAt += 1;
      }
    }

    result.splice(insertAt, 0, directive.block);
  }

  return result;
}

// The Editorial Hub also contains complete, markerless articles. Accept them
// only when the page clearly starts with article prose and has a real H2 outline.
// Never import editorial-only notes, SEO fields or Admin block manifests as prose.
function selectNotionArticleBodyBlocks(blocks: NotionBlock[]) {
  const markerIndex = blocks.findIndex((block) =>
    block.type === "heading_2" && isStartHeading(blockText(block))
  );
  const from = markerIndex >= 0 ? markerIndex + 1 : 0;
  let until = blocks.length;
  for (let index = from; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block.type !== "heading_2") continue;
    const heading = blockText(block);
    if (
      isStopHeading(heading)
      || isAdminManifestHeading(heading)
      || normalizeText(heading).toLocaleLowerCase("sk") === "pred publikovaním"
    ) {
      until = index;
      break;
    }
  }
  const selected = blocks.slice(from, until);
  if (markerIndex < 0) {
    const first = selected.find((block) => blockText(block).length > 0);
    const headingCount = selected.filter((block) => block.type === "heading_2" && blockText(block)).length;
    if (!first || first.type !== "paragraph" || blockText(first).length < 20 || headingCount < 2) {
      throw new Error("Článok potrebuje nadpis „Článok — draft“ alebo bezpečný úvod a aspoň dva obsahové nadpisy H2.");
    }
  }
  return selected;
}

function convertBodyBlocks(blocks: NotionBlock[]) {
  const selected = selectNotionArticleBodyBlocks(blocks);

  let intro = "";
  let introRichText: EditorialRichTextDocument | null = null;
  const articleBlocks: ArticleBlock[] = [];
  let listBuffer: { type: "bullet-list" | "numbered-list"; items: string[]; id: string } | null = null;

  const flushList = () => {
    if (!listBuffer) return;
    if (listBuffer.items.length) articleBlocks.push(listBuffer);
    listBuffer = null;
  };

  selected.forEach((block, index) => {
    const text = blockText(block);
    if (!text && block.type !== "divider" && block.type !== "image" && block.type !== "video" && block.type !== "embed" && block.type !== "table") return;

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
      const item = notionRichTextMarkdown(blockRichText(block));
      if (item) listBuffer.items.push(item);
      return;
    }

    flushList();

    if (block.type === "paragraph") {
      const richText = notionRichTextDocument(blockRichText(block), "paragraph");
      if (!intro && text.length >= 20) {
        intro = text;
        introRichText = richText;
        return;
      }
      if (text) articleBlocks.push({
        id: notionBlockId(block, index),
        type: "text",
        content: text,
        ...(richText ? { richText } : {}),
      });
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
      const richText = notionRichTextDocument(blockRichText(block), "blockquote");
      articleBlocks.push({
        id: notionBlockId(block, index),
        type: "quote",
        content: text,
        ...(richText ? { richText } : {}),
      });
      return;
    }
    if (block.type === "callout") {
      const type = calloutType(block);
      const richText = notionRichTextDocument(blockRichText(block), "callout", type === "warning" ? "warning" : "tip");
      articleBlocks.push({
        id: notionBlockId(block, index),
        type,
        content: text,
        ...(richText ? { richText } : {}),
      });
      return;
    }

    const image = notionImageBlock(block, index);
    if (image) {
      articleBlocks.push(image);
      return;
    }
    const embed = notionEmbedBlock(block, index);
    if (embed) {
      articleBlocks.push(embed);
      return;
    }
    const table = notionTableBlock(block, index);
    if (table) articleBlocks.push(table);
  });
  flushList();

  if (intro.length < 20) {
    throw new Error("Synchronizovaná časť článku potrebuje úvodný odsek s aspoň 20 znakmi.");
  }
  if (!articleBlocks.length) {
    throw new Error("Synchronizovaná časť článku neobsahuje žiadny podporovaný obsahový blok.");
  }

  const manifest = parseAdminManifest(blocks);
  return {
    intro,
    introRichText,
    blocks: placeManifestBlocks(articleBlocks, manifest),
  };
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
  confirmedPrevious?: ArticleSeoRemoteValues | null,
): ManagedArticleInput {
  const title = titleProperty(page, "Názov");
  const slug = richTextProperty(page, "Slug");
  const notionCategory = selectProperty(page, "Kategória");
  const notionSubsection = selectProperty(page, "Podsekcia");
  const contentType = selectProperty(page, "Typ obsahu");
  const seoFields = articleSeoFromNotion(page, existing, confirmedPrevious);
  const metaDescription = seoFields.metaDescription;
  const socialCaption = propertyRecord(page, "Popis na sociálne siete")
    ? richTextProperty(page, "Popis na sociálne siete")
    : (existing && "socialCaption" in existing ? (existing as { socialCaption?: string }).socialCaption ?? "" : "");
  const { intro, introRichText, blocks: articleBlocks } = convertBodyBlocks(blocks);

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
    introRichText,
    takeaway: "",
    sections: [],
    blocks: articleBlocks,
    sources: [],
    readingMinutes: estimateReadingMinutes(intro, articleBlocks),
    publishedAt: null,
    showUpdated: false,
    ...seoFields,
    socialCaption,
    relatedBreedIds: [],
  };
}

function validateSyncGate(page: NotionPage, existingPublished = false) {
  // Canonical publication authorizes editorial edits regardless of whether
  // the Notion row still says "Na kontrolu". New publication still needs Ready.
  if (existingPublished || selectProperty(page, "Stav") === "Publikované") return;
  if (selectProperty(page, "Stav") !== "Ready") {
    throw new Error("Článok nie je v stave Ready na automatický prenos do adminu.");
  }
  if (!checkboxProperty(page, "Odoslať na Psipedia")) {
    throw new Error("Automatický prenos článku nie je povolený (Odoslať na Psipedia).");
  }
}

async function notionRequest<T>(
  bindings: NotionSyncBindings,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  // Use the same SDK transport, Retry-After and bounded 429/5xx retries
  // already used by other Notion sync adapters. Never retry an entire
  // content-writeback transaction by itself.
  return notionSharedRequest<T>(bindings, path, init);
}

async function listReadyNotionPages(bindings: NotionSyncBindings) {
  const dataSourceId = bindings.NOTION_ARTICLES_DATA_SOURCE_ID?.trim();
  if (!dataSourceId) throw new Error("NOTION_ARTICLES_DATA_SOURCE_ID nie je nakonfigurovaný.");

  // Retry legacy unapproved Ready errors for receipt-only reconciliation.
  // A matching published canonical article and unchanged hash are mandatory.
  const legacy = await notionRequest<NotionQueryResponse>(
    bindings,
    `/data_sources/${encodeURIComponent(dataSourceId)}/query`,
    {
      method: "POST",
      body: JSON.stringify({
        filter: { and: [
          { property: "Stav", select: { equals: "Ready" } },
          { property: "Odoslať na Psipedia", checkbox: { equals: false } },
          { property: "Psipedia ID", rich_text: { is_not_empty: true } },
          { property: "Sync chyba", rich_text: { contains: "Prepojený článok už nie je Draft" } },
        ] },
        sorts: [{ timestamp: "last_edited_time", direction: "ascending" }],
        page_size: MAX_LEGACY_READY_RECEIPTS_PER_SWEEP,
      }),
    },
  );
  const results: NotionPage[] = [...(legacy.results ?? [])];
  let cursor: string | null = null;
  do {
    const response = await notionRequest<NotionQueryResponse>(
      bindings,
      `/data_sources/${encodeURIComponent(dataSourceId)}/query`,
      {
        method: "POST",
        body: JSON.stringify({
          // An explicit editorial opt-in avoids retrying historical errors and
          // prevents importing Ready articles that were not approved for sending.
          filter: {
            or: [
              { and: [
                { property: "Stav", select: { equals: "Ready" } },
                { property: "Odoslať na Psipedia", checkbox: { equals: true } },
              ] },
              { property: "Stav", select: { equals: "Publikované" } },
              { property: "Stav", select: { equals: "Na kontrolu" } },
            ],
          },
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

async function getBlockChildren(bindings: NotionSyncBindings, blockId: string) {
  const results: NotionBlock[] = [];
  let cursor: string | null = null;
  do {
    const query = new URLSearchParams({ page_size: "100" });
    if (cursor) query.set("start_cursor", cursor);
    const response = await notionRequest<NotionBlocksResponse>(
      bindings,
      `/blocks/${encodeURIComponent(blockId)}/children?${query.toString()}`,
    );
    results.push(...(response.results ?? []));
    cursor = response.has_more && response.next_cursor ? response.next_cursor : null;
  } while (cursor && results.length < 500);
  return results.slice(0, 500);
}

async function getPageBlocks(bindings: NotionSyncBindings, pageId: string) {
  const results = await getBlockChildren(bindings, pageId);
  return Promise.all(results.map(async (block) => (
    block.type === "table" && block.has_children
      ? { ...block, children: await getBlockChildren(bindings, block.id) }
      : block
  )));
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


/**
 * A D1 publication is authoritative. Scheduled rows remain "scheduled" in D1
 * even after published_at; public GET routes intentionally do not write to D1.
 *
 * This helper is shared by explicit Admin publishes and the hourly Cron repair.
 * Read Notion before PATCH so a replay is harmless and editorial revocations
 * (Draft / unchecked send) are never silently overwritten.
 */
export async function writeBackPublishedArticleToNotion(args: {
  database: D1Database;
  bindings: NotionSyncBindings;
  article: {
    id: number;
    slug: string;
    portalSection: string;
    status: string;
    publishedAt: string | null;
    updatedAt?: string;
  };
  now?: string;
}) {
  if (!flagEnabled(args.bindings.NOTION_ARTICLE_SYNC_ENABLED)) {
    return { linked: false, updated: false, reason: "disabled" as const };
  }
  const now = args.now ?? new Date().toISOString();
  const dueScheduled = args.article.status === "scheduled"
    && Boolean(args.article.publishedAt)
    && Number.isFinite(Date.parse(args.article.publishedAt!))
    && Date.parse(args.article.publishedAt!) <= Date.parse(now);
  if (args.article.status !== "published" && !dueScheduled) {
    return { linked: false, updated: false, reason: "not-published" as const };
  }
  // Some legacy published rows have no reliable published_at. Never replace
  // that missing historical fact with the current Cron/Admin request time:
  // a later run would interpret the fabricated date as a publication conflict.
  // Leave the Notion page and D1 mapping untouched for individual review.
  const publishedAt = args.article.publishedAt;
  if (!publishedAt || !Number.isFinite(Date.parse(publishedAt))) {
    return { linked: false, updated: false, reason: "missing-publication-date" as const };
  }

  const mapping = await args.database.prepare(
    "SELECT notion_page_id FROM article_notion_sync WHERE article_id = ? LIMIT 1",
  ).bind(args.article.id).first<{ notion_page_id: string }>();
  if (!mapping?.notion_page_id) {
    return { linked: false, updated: false, reason: "not-linked" as const };
  }

  const publicUrl = SITE_URL + articleHref({
    slug: args.article.slug,
    portalSection: args.article.portalSection,
  });
  const page = await notionRequest<NotionPage>(
    args.bindings,
    "/pages/" + encodeURIComponent(mapping.notion_page_id),
  );
  // A mapped page may have been moved/archived or re-linked since mapping
  // creation. Never PATCH a foreign page or acknowledge it in D1.
  if (page.id !== mapping.notion_page_id || page.archived || page.in_trash
    || (richTextProperty(page, "Psipedia ID")
      && richTextProperty(page, "Psipedia ID") !== String(args.article.id))) {
    throw new Error("NOTION_ARTICLE_PUBLICATION_IDENTITY_CONFLICT");
  }
  const notionState = selectProperty(page, "Stav");
  const remoteUrl = urlProperty(page, "URL Psipedia");
  const date = propertyRecord(page, "Dátum publikácie")?.date;
  const remoteDate = date && typeof date === "object"
    ? (date as { start?: unknown }).start : null;
  const sameDate = typeof remoteDate === "string"
    && Number.isFinite(Date.parse(remoteDate))
    && Date.parse(remoteDate) === Date.parse(publishedAt);
  const publishedMatches = notionState === "Publikované"
    && remoteUrl === publicUrl && sameDate;

  if (notionState === "Publikované" && !publishedMatches) {
    throw new Error("NOTION_PUBLICATION_CONFLICT");
  }
  if (!publishedMatches && (notionState !== "Ready" || !checkboxProperty(page, "Odoslať na Psipedia"))) {
    throw new Error("NOTION_PUBLICATION_NOT_APPROVED");
  }

  // Re-read after the network request: a concurrent reschedule, unpublish or
  // edit must not be acknowledged based on the stale Cron/Admin snapshot.
  const current = await args.database.prepare(
    "SELECT slug, portal_section, status, published_at, updated_at FROM managed_articles WHERE id = ? LIMIT 1",
  ).bind(args.article.id).first<{
    slug: string; portal_section: string; status: string;
    published_at: string | null; updated_at: string;
  }>();
  if (!current
    || current.slug !== args.article.slug
    || current.portal_section !== args.article.portalSection
    || current.status !== args.article.status
    || current.published_at !== args.article.publishedAt
    || (args.article.updatedAt && current.updated_at !== args.article.updatedAt)
    || (current.status === "scheduled" && (!current.published_at || Date.parse(current.published_at) > Date.parse(now)))) {
    throw new Error("D1_PUBLICATION_CHANGED");
  }

  const alreadySynced = publishedMatches
    && selectProperty(page, "Sync stav") === "Synchronizované"
    && !richTextProperty(page, "Sync chyba");
  if (!alreadySynced) {
    // Read-before-write alone cannot prove the remote PATCH completed.
    // Verify the returned page ID and exact canonical publication properties
    // before advancing the D1 receipt; a partial response is not success.
    const echoed = await notionRequest<NotionPage>(
      args.bindings,
      "/pages/" + encodeURIComponent(mapping.notion_page_id),
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
    const echoedDate = propertyRecord(echoed, "Dátum publikácie")?.date;
    const echoedPublishedAt = echoedDate && typeof echoedDate === "object"
      ? (echoedDate as { start?: unknown }).start : null;
    if (echoed.id !== mapping.notion_page_id || echoed.archived || echoed.in_trash
      || !echoed.properties
      || (richTextProperty(echoed, "Psipedia ID")
        && richTextProperty(echoed, "Psipedia ID") !== String(args.article.id))
      || selectProperty(echoed, "Stav") !== "Publikované"
      || urlProperty(echoed, "URL Psipedia") !== publicUrl
      || typeof echoedPublishedAt !== "string"
      || Date.parse(echoedPublishedAt) !== Date.parse(publishedAt)) {
      throw new Error("NOTION_ARTICLE_PUBLICATION_ECHO_UNVERIFIED");
    }
  }

  // Mark only a successfully repaired/already correct mapping. This timestamp
  // also rotates the bounded Cron scan instead of repeatedly checking page 1.
  await args.database.prepare(
    "UPDATE article_notion_sync SET last_synced_at = ?, updated_at = ? WHERE notion_page_id = ? AND article_id = ?",
  ).bind(now, now, mapping.notion_page_id, args.article.id).run();

  return {
    linked: true,
    updated: !alreadySynced,
    notionPageId: mapping.notion_page_id,
    publicUrl,
  };
}


/**
 * Targeted SEO-only Admin -> Notion writeback for drafts and published articles.
 * Every Notion mutation is restricted to fields actually changed by this save.
 * Publication, slug, author, hero, body and every other SEO field are untouched.
 */
export async function writeBackArticleSeoToNotion(args: {
  database: D1Database;
  bindings: NotionSyncBindings;
  before: ManagedArticle;
  article: ManagedArticle;
}): Promise<{ linked: boolean; updated: boolean; reason?: string; failedFields?: ArticleSeoFieldFailure[] }> {
  if (!flagEnabled(args.bindings.NOTION_ARTICLE_SYNC_ENABLED) ||
      !flagEnabled(args.bindings.NOTION_ARTICLE_CONTENT_WRITEBACK_ENABLED)) {
    return { linked: false, updated: false, reason: "disabled" };
  }
  const { before, article } = args;
  if (before.id !== article.id || before.slug !== article.slug) {
    throw new Error("NOTION_ARTICLE_IDENTITY_CONFLICT");
  }
  if (article.status !== "draft" && article.status !== "published") {
    return { linked: false, updated: false, reason: "not-editable" };
  }
  const changed = articleSeoChangedFields(before, article);
  if (!changed.length) return { linked: true, updated: false, reason: "unchanged" };
  const mapping = await args.database.prepare(
    "SELECT notion_page_id, article_id, content_hash FROM article_notion_sync WHERE article_id = ? LIMIT 1",
  ).bind(article.id).first<{ notion_page_id: string; article_id: number; content_hash: string }>();
  if (!mapping) return { linked: false, updated: false, reason: "not-linked" };
  const receipt = decodeArticleSeoReceipt(mapping.content_hash);
  const confirmedSeo = receipt.seo;

  const assertCurrentRevision = async () => {
    const current = await args.database.prepare(
      "SELECT status, updated_at FROM managed_articles WHERE id = ? LIMIT 1",
    ).bind(article.id).first<{ status: string; updated_at: string }>();
    if (!current || current.status !== article.status || current.updated_at !== article.updatedAt) {
      throw new Error("ADMIN_ARTICLE_REVISION_CONFLICT");
    }
  };
  await assertCurrentRevision();
  const journalExists = await args.database.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'article_notion_editorial_outbox'",
  ).first<{ name: string }>();
  if (journalExists) {
    const pending = await args.database.prepare(
      "SELECT article_id FROM article_notion_editorial_outbox WHERE notion_page_id = ? LIMIT 1",
    ).bind(mapping.notion_page_id).first<{ article_id: number }>();
    if (pending) throw new Error("NOTION_EDITORIAL_WRITEBACK_PENDING");
  }

  const readPage = () => notionRequest<NotionPage>(
    args.bindings, "/pages/" + encodeURIComponent(mapping.notion_page_id),
  );
  const sameArticle = (page: NotionPage) =>
    page.id === mapping.notion_page_id && !page.archived && !page.in_trash &&
    richTextProperty(page, "Psipedia ID") === String(article.id) &&
    richTextProperty(page, "Slug") === article.slug &&
    (!page.parent?.data_source_id ||
      page.parent.data_source_id === args.bindings.NOTION_ARTICLES_DATA_SOURCE_ID);
  const assertApproved = (page: NotionPage) => {
    if (!sameArticle(page)) throw new Error("NOTION_ARTICLE_IDENTITY_CONFLICT");
    if (article.status === "draft" &&
        (selectProperty(page, "Stav") !== "Ready" ||
         !checkboxProperty(page, "Odoslať na Psipedia"))) {
      throw new Error("NOTION_DRAFT_WRITEBACK_NOT_APPROVED");
    }
  };
  const page = await readPage();
  assertApproved(page);
  const { ready, failures } = planArticleSeoIndependentWriteback({
    before, after: article, properties: page.properties ?? {}, siteUrl: SITE_URL,
  });
  const externalDrift = articleSeoUnacknowledgedRemoteFields(page.properties ?? {}, confirmedSeo)
    .filter(field => !changed.includes(field));
  for (const field of externalDrift) {
    failures.push({ field, code: "NOTION_ARTICLE_SEO_REMOTE_EDIT_PENDING" });
  }

  // Compare against the full acknowledged import. If a changed SEO field
  // diverged in Notion, restore ONLY its confirmed raw value in the hash
  // projection. Unrelated Notion edits still block writeback, but a bad SEO
  // property cannot block the other independently edited SEO properties.
  const contentHash = async (sourcePage: NotionPage, fallback: ManagedArticle) => {
    const blocks = await getPageBlocks(args.bindings, sourcePage.id);
    const payload = notionPageToManagedArticleInput(sourcePage, blocks, fallback, confirmedSeo);
    const image = notionArticleMainImageSource(sourcePage);
    return sha256(JSON.stringify({
      payload,
      notionImageSourceUrl: urlProperty(sourcePage, "Hlavný obrázok URL"),
      ...(image.fileIdentity ? { notionImageFileIdentity: image.fileIdentity } : {}),
      notionImageAlt: richTextProperty(sourcePage, "Alt text obrázka"),
      notionImageCreditUrl: urlProperty(sourcePage, "Zdroj obrázka"),
    }));
  };
  let originalHash = await contentHash(page, before);
  if (originalHash !== receipt.hash) {
    const confirmed = projectArticleSeoConfirmedBaseline(page, confirmedSeo,
      [...new Set([...changed, ...externalDrift])]
        .map(field => ({ field, code: "NOTION_ARTICLE_SEO_FIELD_CONFLICT" })));
    originalHash = await contentHash(confirmed, before);
    if (originalHash !== receipt.hash) {
      throw new Error("NOTION_ARTICLE_SEO_REMOTE_CONFLICT");
    }
  }

  let written = 0;
  let markedPending = false;
  const failure = (field: ArticleSeoFieldFailure["field"], error: unknown) => {
    const raw = error instanceof Error ? error.message : "";
    failures.push({
      field,
      code: /^NOTION_ARTICLE_SEO_[A-Z0-9_]+$/.test(raw) ? raw : "REMOTE_WRITEBACK_FAILED",
    });
  };
  // Send each field separately. A concurrent edit or transient PATCH/echo
  // failure affects that property only, not the remaining eligible fields.
  for (const { field, plan } of ready) {
    try {
      const latest = await readPage();
      assertApproved(latest);
      verifyArticleSeoPatch(plan, latest.properties ?? {}, "before");
      await assertCurrentRevision();
      if (Object.keys(plan.properties).length) {
        if (!markedPending) {
          await updateNotionSyncState(args.bindings, page.id, {
            state: "Chyba", error: "ARTICLE_SEO_WRITEBACK_PENDING",
          });
          markedPending = true;
        }
        await notionRequest(args.bindings, "/pages/" + encodeURIComponent(page.id), {
          method: "PATCH", body: JSON.stringify({ properties: plan.properties }),
        });
      }
      const verified = await readPage();
      assertApproved(verified);
      verifyArticleSeoPatch(plan, verified.properties ?? {}, "after");
      if (Object.keys(plan.properties).length) written++;
    } catch (error) {
      // Revision, identity or approval violations are global safeguards.
      const code = error instanceof Error ? error.message : "";
      if (code === "ADMIN_ARTICLE_REVISION_CONFLICT" ||
          code === "NOTION_ARTICLE_IDENTITY_CONFLICT" ||
          code === "NOTION_DRAFT_WRITEBACK_NOT_APPROVED") throw error;
      failure(field, error);
    }
  }

  if (failures.length) {
    // Never acknowledge the entire remote snapshot while any SEO field is
    // unresolved: doing so would make a later inbound sync skip Notion edits.
    await updateNotionSyncState(args.bindings, page.id, {
      state: "Chyba", error: "ARTICLE_SEO_WRITEBACK_PARTIAL",
    });
    return { linked: true, updated: written > 0, reason: "partial", failedFields: failures };
  }

  const verifiedPage = await readPage();
  assertApproved(verifiedPage);
  await assertCurrentRevision();
  // Verify the whole page is still the same preimage, except for the fields
  // written by this save. This prevents acknowledging concurrent Notion edits
  // to body, media or untouched SEO properties that arrived during PATCH.
  const replayProperties = { ...verifiedPage.properties };
  for (const field of changed) {
    const name = SEO[field].name;
    if (Object.hasOwn(page.properties ?? {}, name)) {
      replayProperties[name] = page.properties![name];
    }
  }
  const replayHash = await contentHash({ ...verifiedPage, properties: replayProperties }, before);
  if (replayHash !== originalHash) {
    await updateNotionSyncState(args.bindings, page.id, {
      state: "Chyba", error: "ARTICLE_SEO_WRITEBACK_REMOTE_EDIT_PENDING",
    });
    return { linked: true, updated: written > 0, reason: "partial",
      failedFields: [{ field: changed[0], code: "NOTION_ARTICLE_SEO_REMOTE_EDIT_PENDING" }] };
  }
  // Re-read completed SEO values after the last PATCH and before advancing
  // the receipt; an external writer may have changed an earlier field.
  const lateFailures: ArticleSeoFieldFailure[] = [];
  for (const { field, plan } of ready) {
    try {
      verifyArticleSeoPatch(plan, verifiedPage.properties ?? {}, "after");
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      lateFailures.push({ field,
        code: /^NOTION_ARTICLE_SEO_[A-Z0-9_]+$/.test(code) ? code : "REMOTE_WRITEBACK_FAILED" });
    }
  }
  if (lateFailures.length) {
    await updateNotionSyncState(args.bindings, page.id, {
      state: "Chyba", error: "ARTICLE_SEO_WRITEBACK_PARTIAL",
    });
    return { linked: true, updated: written > 0, reason: "partial", failedFields: lateFailures };
  }
  const finalHash = await contentHash(verifiedPage, article);
  const now = new Date().toISOString();
  const saved = await args.database.prepare(
    "UPDATE article_notion_sync SET content_hash = ?, notion_last_edited_time = ?, " +
    "last_synced_at = ?, updated_at = ? WHERE notion_page_id = ? AND article_id = ? AND content_hash = ?",
  ).bind(encodeArticleSeoReceipt(finalHash, verifiedPage), verifiedPage.last_edited_time ?? null,
    now, now, verifiedPage.id, article.id, mapping.content_hash).run();
  if (saved.meta?.changes !== 1) throw new Error("NOTION_ARTICLE_SEO_MAPPING_CONFLICT");
  await updateNotionSyncState(args.bindings, verifiedPage.id, {
    state: "Synchronizované", articleId: article.id, syncedAt: now,
  });
  return { linked: true, updated: written > 0 };
}

/**
 * Editor-driven, opt-in draft content writeback. A persistent outbox records
 * the remote preimage and target before any HTTP PATCH; retries are accepted
 * only when each field is still at the preimage or already at our target.
 * Neither publication nor scheduler workflows call this function.
 */
export async function writeBackDraftArticleContentToNotion(args: {
  database: D1Database;
  bindings: NotionSyncBindings;
  article: ManagedArticle;
}): Promise<{ linked: boolean; updated: boolean; reason?: string }> {
  if (!flagEnabled(args.bindings.NOTION_ARTICLE_CONTENT_WRITEBACK_ENABLED)) {
    return { linked: false, updated: false, reason: "disabled" };
  }
  const article = args.article;
  if (article.status !== "draft") return { linked: false, updated: false, reason: "not-draft" };
  if (!flagEnabled(args.bindings.NOTION_ARTICLE_SYNC_ENABLED)) {
    return { linked: false, updated: false, reason: "import-disabled" };
  }
  const mapping = await args.database.prepare(
    "SELECT notion_page_id, article_id, content_hash FROM article_notion_sync WHERE article_id = ? LIMIT 1",
  ).bind(article.id).first<{ notion_page_id: string; article_id: number; content_hash: string }>();
  if (!mapping) return { linked: false, updated: false, reason: "not-linked" };

  type Journal = {
    notion_page_id: string; article_id: number; article_updated_at: string;
    base_content_hash: string; operations_json: string;
  };
  async function assertCurrentDraft() {
    const current = await args.database.prepare(
      "SELECT status, updated_at FROM managed_articles WHERE id = ? LIMIT 1",
    ).bind(article.id).first<{ status: string; updated_at: string }>();
    if (!current || current.status !== "draft" || current.updated_at !== article.updatedAt) {
      throw new Error("ADMIN_ARTICLE_REVISION_CONFLICT");
    }
  }
  await assertCurrentDraft();
  let journal = await args.database.prepare(
    "SELECT * FROM article_notion_editorial_outbox WHERE notion_page_id = ? LIMIT 1",
  ).bind(mapping.notion_page_id).first<Journal>();
  const page = await notionRequest<NotionPage>(
    args.bindings, "/pages/" + encodeURIComponent(mapping.notion_page_id),
  );
  if (page.id !== mapping.notion_page_id || selectProperty(page, "Stav") !== "Ready" ||
    !checkboxProperty(page, "Odoslať na Psipedia")) {
    throw new Error("NOTION_DRAFT_WRITEBACK_NOT_APPROVED");
  }
  // Keep file-backed heroes in Notion Files during text-only writeback.
  // If an editor replaces the hero, export the new R2 URL into the legacy URL
  // property; that explicit URL takes precedence over a previous attachment.
  let mirroredHero = article.image ?? null;
  const notionHero = notionArticleMainImageSource(page);
  if (article.imageKey && notionHero.url && args.bindings.BUCKET) {
    const currentImage = await args.bindings.BUCKET.head(article.imageKey);
    if (currentImage?.customMetadata?.notionSourceHash === await sha256(notionHero.identity)) {
      mirroredHero = notionHero.kind === "file" ? null : notionHero.url;
    }
  }
  const editorProjection = {
    id: article.id, status: article.status, slug: article.slug, title: article.title,
    intro: article.intro, introRichText: article.introRichText,
    blocks: article.blocks ?? [],
    seoTitle: article.seo?.title ?? "",
    metaDescription: article.seo?.description ?? "",
    socialCaption: article.socialCaption ?? "",
    focusKeyword: article.seo?.focusKeyword ?? "",
    ogTitle: article.seo?.ogTitle ?? "",
    ogDescription: article.seo?.ogDescription ?? "",
    image: mirroredHero,
    imageAlt: article.imageAlt ?? "",
    imageCreditUrl: article.imageCreditUrl ?? "",
  };
  // A mapping alone does not authorize writes to a page whose canonical
  // identity was erased or changed. Require the matching persisted Notion ID
  // on every read, including journal retries and final verification. Archived
  // or trashed pages are withdrawn editorial content even if their old Ready
  // checkbox, canonical identity and journal still match.
  const matchesEditorialIdentity = (value: NotionPage) =>
    value.archived !== true && value.in_trash !== true &&
    value.id === mapping.notion_page_id &&
    richTextProperty(value, "Psipedia ID") === String(article.id);
  if (!matchesEditorialIdentity(page)) {
    throw new Error("NOTION_ARTICLE_IDENTITY_CONFLICT");
  }
  // These properties are not legitimate targets of editorial writeback.
  // Guard them on initial and resumed attempts, including after all PATCHes.
  const protectedPropertyNames = [
    "Psipedia ID", "Slug", "Kategória", "Typ obsahu",
    "Stav", "Odoslať na Psipedia", "Titulný obrázok",
  ];
  const pageGuard = (value: NotionPage) => JSON.stringify(
    protectedPropertyNames.map((name) => [name, value.properties?.[name] ?? null]),
  );
  let plan: NotionEditorialPlan;
  if (journal) {
    if (journal.article_id !== article.id || journal.article_updated_at !== article.updatedAt) {
      // Outbox ownership must never silently change on a later editor revision.
      throw new Error("NOTION_EDITORIAL_OUTBOX_CONFLICT");
    }
    plan = JSON.parse(journal.operations_json) as NotionEditorialPlan;
  } else {
    const remoteBlocks = await getPageBlocks(args.bindings, page.id);
    const current = notionPageToManagedArticleInput(page, remoteBlocks, article,
      decodeArticleSeoReceipt(mapping.content_hash).seo);
    const currentContentHash = await sha256(JSON.stringify({
      payload: current,
      notionImageSourceUrl: urlProperty(page, "Hlavný obrázok URL"),
      // Keep the previous hash shape for pages without a Files hero.
      ...(notionArticleMainImageSource(page).fileIdentity
        ? { notionImageFileIdentity: notionArticleMainImageSource(page).fileIdentity } : {}),
      notionImageAlt: richTextProperty(page, "Alt text obrázka"),
      notionImageCreditUrl: urlProperty(page, "Zdroj obrázka"),
    }));
    if (decodeArticleSeoReceipt(mapping.content_hash).hash !== currentContentHash) {
      throw new Error("NOTION_EDITORIAL_REMOTE_CONFLICT");
    }
    const selected = selectNotionArticleBodyBlocks(remoteBlocks);
    plan = buildNotionEditorialPlan({
      article: editorProjection, remoteBlocks: selected as RemoteArticleBlock[],
      pageProperties: page.properties ?? {}, siteUrl: SITE_URL,
      seoFields: [], // SEO-only changed-field writer handles all eight properties.
    });
    plan.pageGuard = pageGuard(page);
    plan.fullBlockOrder = remoteBlocks.map((block) => block.id + ":" + block.type);
    const changed = plan.blocks.length > 0 || Object.keys(plan.properties).length > 0;
    if (!changed) return { linked: true, updated: false, reason: "unchanged" };
    const now = new Date().toISOString();
    // INSERT OR IGNORE arbitrates simultaneous retries. The winner's revision
    // and immutable operation preimages are always read back and checked.
    await args.database.prepare(
      "INSERT OR IGNORE INTO article_notion_editorial_outbox " +
      "(notion_page_id, article_id, article_updated_at, base_content_hash, operations_json, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(page.id, article.id, article.updatedAt, mapping.content_hash, JSON.stringify(plan), now, now).run();
    journal = await args.database.prepare(
      "SELECT * FROM article_notion_editorial_outbox WHERE notion_page_id = ? LIMIT 1",
    ).bind(mapping.notion_page_id).first<Journal>();
    if (!journal || journal.article_id !== article.id || journal.article_updated_at !== article.updatedAt ||
      journal.base_content_hash !== mapping.content_hash || journal.operations_json !== JSON.stringify(plan)) {
      throw new Error("NOTION_EDITORIAL_OUTBOX_CONFLICT");
    }
  }

  // A CAS claim serializes this application's concurrent workers for this
  // mapping/revision. Expiration permits crash recovery, not Notion atomicity.
  // A live Notion human edit can still race a PATCH and must be disclosed.
  const leaseOwner = crypto.randomUUID();
  const leaseLengthMs = 15 * 60 * 1000;
  const claimTime = new Date().toISOString();
  const claim = await args.database.prepare(
    "UPDATE article_notion_editorial_outbox SET lease_owner = ?, lease_until = ? " +
    "WHERE notion_page_id = ? AND article_id = ? AND article_updated_at = ? " +
    "AND (lease_owner IS NULL OR lease_until <= ?)",
  ).bind(leaseOwner, new Date(Date.now() + leaseLengthMs).toISOString(),
    page.id, article.id, article.updatedAt, claimTime).run();
  if (claim.meta?.changes !== 1) throw new Error("NOTION_EDITORIAL_WRITEBACK_BUSY");

  async function renewLease() {
    const now = new Date().toISOString();
    const renewal = await args.database.prepare(
      "UPDATE article_notion_editorial_outbox SET lease_until = ? " +
      "WHERE notion_page_id = ? AND article_id = ? AND article_updated_at = ? " +
      "AND lease_owner = ? AND lease_until > ?",
    ).bind(new Date(Date.now() + leaseLengthMs).toISOString(),
      page.id, article.id, article.updatedAt, leaseOwner, now).run();
    if (renewal.meta?.changes !== 1) throw new Error("NOTION_EDITORIAL_LEASE_LOST");
  }
  function verifySnapshot(blocks: NotionBlock[]) {
    if (!plan.pageGuard || !Array.isArray(plan.fullBlockOrder) ||
      !Array.isArray(plan.blockSnapshots) || plan.blockSnapshots.length === 0) {
      throw new Error("NOTION_EDITORIAL_JOURNAL_INCOMPATIBLE");
    }
    const identities = blocks.map((block) => block.id + ":" + block.type);
    if (JSON.stringify(identities) !== JSON.stringify(plan.fullBlockOrder)) {
      throw new Error("NOTION_EDITORIAL_STRUCTURE_CONFLICT");
    }
    const selected = selectNotionArticleBodyBlocks(blocks);
    if (selected.length !== plan.blockSnapshots.length) {
      throw new Error("NOTION_EDITORIAL_STRUCTURE_CONFLICT");
    }
    const targets = new Map(plan.blocks.map((op) => [op.id, op.after]));
    for (let i = 0; i < selected.length; i++) {
      const snapshot = plan.blockSnapshots[i];
      const block = selected[i];
      if (block.id !== snapshot.id || block.type !== snapshot.type) {
        throw new Error("NOTION_EDITORIAL_STRUCTURE_CONFLICT");
      }
      const actual = notionEditorialBlockShape(block as RemoteArticleBlock);
      if (actual !== snapshot.before && actual !== targets.get(block.id)) {
        throw new Error("NOTION_EDITORIAL_BLOCK_CONFLICT");
      }
    }
  }
  try {
  await assertCurrentDraft();
  // Read every current property before patching. Unknown values are human
  // changes or schema drift, not permission to force our own last writer.
  const latest = await notionRequest<NotionPage>(
    args.bindings, "/pages/" + encodeURIComponent(mapping.notion_page_id),
  );
  if (!matchesEditorialIdentity(latest)) throw new Error("NOTION_ARTICLE_IDENTITY_CONFLICT");
  if (pageGuard(latest) !== plan.pageGuard) throw new Error("NOTION_EDITORIAL_METADATA_CONFLICT");
  if (selectProperty(latest, "Stav") !== "Ready" ||
    !checkboxProperty(latest, "Odoslať na Psipedia")) throw new Error("NOTION_EDITORIAL_STATUS_CONFLICT");
  // Inspect every planned block before the FIRST mutating request. A
  // conflict discovered in a later block must not first modify SEO fields
  // or earlier blocks. The per-block GET below still checks the latest
  // preimage immediately before each actual PATCH.
  const preflightBlocks = await getPageBlocks(args.bindings, page.id);
  verifySnapshot(preflightBlocks);
  const preflightById = new Map(preflightBlocks.map((block, index) => [block.id, { block, index }]));
  if (preflightById.size !== preflightBlocks.length) {
    throw new Error("NOTION_EDITORIAL_BLOCK_IDENTITY_CONFLICT");
  }
  let lastPlannedIndex = -1;
  for (const op of plan.blocks) {
    const current = preflightById.get(op.id);
    if (!current || current.block.type !== op.type) {
      throw new Error("NOTION_EDITORIAL_BLOCK_IDENTITY_CONFLICT");
    }
    if (current.index <= lastPlannedIndex) {
      throw new Error("NOTION_EDITORIAL_BLOCK_ORDER_CONFLICT");
    }
    lastPlannedIndex = current.index;
    const fingerprint = notionEditorialBlockShape(current.block);
    if (fingerprint !== op.before && fingerprint !== op.after) {
      throw new Error("NOTION_EDITORIAL_BLOCK_CONFLICT");
    }
  }
  const fields: Record<string, unknown> = {};
  for (const [name, expected] of Object.entries(plan.propertyAfter)) {
    const type = name === "Názov" ? "title" : name === "Hlavný obrázok URL" ||
      name === "Zdroj obrázka" ? "url" : "rich_text";
    if (!Object.hasOwn(latest.properties ?? {}, name)) throw new Error("NOTION_SCHEMA_CHANGED");
    const value = notionEditorialPropertyText(latest.properties?.[name], type);
    if (value === expected) continue;
    if (value !== plan.propertyBefore[name]) throw new Error("NOTION_EDITORIAL_PROPERTY_CONFLICT");
    if (!Object.hasOwn(plan.properties, name)) throw new Error("NOTION_EDITORIAL_PROPERTY_CONFLICT");
    fields[name] = plan.properties[name];
  }
  // Before the FIRST content mutation, replace any stale previous
  // "Synchronizované" receipt. A partial operation must visibly remain
  // unsynchronized; "Chyba" is an existing Notion select value, unlike an
  // unverified new pending option. Never write a success receipt on failure.
  await assertCurrentDraft();
  await renewLease();
  await updateNotionSyncState(args.bindings, page.id, {
    state: "Chyba", error: "EDITORIAL_WRITEBACK_PENDING",
  });
  if (Object.keys(fields).length) {
    await assertCurrentDraft();
    await renewLease();
    await notionRequest(args.bindings, "/pages/" + encodeURIComponent(page.id), {
      method: "PATCH", body: JSON.stringify({ properties: fields }),
    });
  }
  for (const op of plan.blocks) {
    await assertCurrentDraft();
    const remote = await notionRequest<RemoteArticleBlock>(
      args.bindings, "/blocks/" + encodeURIComponent(op.id),
    );
    if (remote.id !== op.id || remote.type !== op.type) throw new Error("NOTION_EDITORIAL_BLOCK_IDENTITY_CONFLICT");
    const actual = notionEditorialBlockShape(remote);
    if (actual === op.after) continue;
    if (actual !== op.before) throw new Error("NOTION_EDITORIAL_BLOCK_CONFLICT");
    await assertCurrentDraft();
    await renewLease();
    await notionRequest(args.bindings, "/blocks/" + encodeURIComponent(op.id), {
      method: "PATCH", body: JSON.stringify(op.payload),
    });
  }

  await assertCurrentDraft();
  const verifiedPage = await notionRequest<NotionPage>(
    args.bindings, "/pages/" + encodeURIComponent(page.id),
  );
  if (!matchesEditorialIdentity(verifiedPage)) throw new Error("NOTION_ARTICLE_IDENTITY_CONFLICT");
  if (pageGuard(verifiedPage) !== plan.pageGuard) throw new Error("NOTION_EDITORIAL_METADATA_CONFLICT");
  if (selectProperty(verifiedPage, "Stav") !== "Ready" ||
    !checkboxProperty(verifiedPage, "Odoslať na Psipedia")) throw new Error("NOTION_EDITORIAL_STATUS_CONFLICT");
  const verifiedBlocks = await getPageBlocks(args.bindings, page.id);
  verifySnapshot(verifiedBlocks);
  const verified = buildNotionEditorialPlan({
    article: editorProjection, remoteBlocks: selectNotionArticleBodyBlocks(verifiedBlocks) as RemoteArticleBlock[],
    pageProperties: verifiedPage.properties ?? {}, siteUrl: SITE_URL,
    seoFields: [],
  });
  if (verified.blocks.length || Object.keys(verified.properties).length) {
    throw new Error("NOTION_EDITORIAL_VERIFICATION_FAILED");
  }
  const newPayload = notionPageToManagedArticleInput(verifiedPage, verifiedBlocks, article,
    decodeArticleSeoReceipt(mapping.content_hash).seo);
  const finalHash = await sha256(JSON.stringify({
    payload: newPayload,
    notionImageSourceUrl: urlProperty(verifiedPage, "Hlavný obrázok URL"),
    ...(notionArticleMainImageSource(verifiedPage).fileIdentity
      ? { notionImageFileIdentity: notionArticleMainImageSource(verifiedPage).fileIdentity } : {}),
    notionImageAlt: richTextProperty(verifiedPage, "Alt text obrázka"),
    notionImageCreditUrl: urlProperty(verifiedPage, "Zdroj obrázka"),
  }));
  await assertCurrentDraft();
  await renewLease();
  const dbUpdate = await args.database.prepare(
    "UPDATE article_notion_sync SET content_hash = ?, notion_last_edited_time = ?, last_synced_at = ?, " +
    "updated_at = ? WHERE notion_page_id = ? AND article_id = ? AND content_hash IN (?, ?)",
  ).bind(encodeArticleSeoReceipt(finalHash, verifiedPage),
    verifiedPage.last_edited_time ?? null, new Date().toISOString(),
    new Date().toISOString(), page.id, article.id,
    journal!.base_content_hash, encodeArticleSeoReceipt(finalHash, verifiedPage)).run();
  if (dbUpdate.meta?.changes !== 1) throw new Error("NOTION_EDITORIAL_MAPPING_CONFLICT");
  await renewLease();
  await updateNotionSyncState(args.bindings, page.id, {
    state: "Synchronizované", articleId: article.id, syncedAt: new Date().toISOString(),
  });
  await renewLease();
  const deleted = await args.database.prepare(
    "DELETE FROM article_notion_editorial_outbox WHERE notion_page_id = ? AND article_id = ? AND article_updated_at = ? AND lease_owner = ?",
  ).bind(page.id, article.id, article.updatedAt, leaseOwner).run();
  if (deleted.meta?.changes !== 1) throw new Error("NOTION_EDITORIAL_LEASE_LOST");
  return { linked: true, updated: true };
  } finally {
    // Failure retains immutable operations and preimages, but releases the
    // claim for safe immediate retry. A crash is recovered by lease expiry.
    try {
      await args.database.prepare(
        "UPDATE article_notion_editorial_outbox SET lease_owner = NULL, lease_until = NULL " +
        "WHERE notion_page_id = ? AND article_id = ? AND lease_owner = ?",
      ).bind(page.id, article.id, leaseOwner).run();
    } catch {
      // Preserve the original conflict/Notion error without exposing content.
    }
  }
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function loadMapping(database: D1Database, pageId: string) {
  return database.prepare(
    "SELECT article_id, content_hash, last_synced_at FROM article_notion_sync WHERE notion_page_id = ? LIMIT 1",
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
    encodeArticleSeoReceipt(contentHash, page),
    now,
    now,
    now,
  ).run();
}

/** Existing canonical articles may precede the Notion bridge. Adopt only a
 * one-to-one slug + section match; never create duplicate public URLs. */
async function findUnmappedCanonicalArticle(
  database: D1Database, page: NotionPage, input: ManagedArticleInput,
) {
  const slug = input.slug?.trim();
  if (!slug) return null;
  const rows = await database.prepare(
    "SELECT id, portal_section FROM managed_articles WHERE slug = ? LIMIT 2",
  ).bind(slug).all<{ id: number; portal_section: string }>();
  if (!rows.results.length) return null;
  if (rows.results.length !== 1 || rows.results[0].portal_section !== input.portalSection) {
    throw new Error("ARTICLE_IDENTITY_REVIEW_REQUIRED: slug alebo sekcia nesúhlasí.");
  }
  const id = rows.results[0].id;
  const claimedId = richTextProperty(page, "Psipedia ID").trim();
  if (claimedId && claimedId !== String(id)) {
    throw new Error("ARTICLE_IDENTITY_REVIEW_REQUIRED: Psipedia ID nesúhlasí.");
  }
  const occupied = await database.prepare(
    "SELECT notion_page_id FROM article_notion_sync WHERE article_id = ? LIMIT 1",
  ).bind(id).first<{ notion_page_id: string }>();
  if (occupied && occupied.notion_page_id !== page.id) {
    throw new Error("ARTICLE_MAPPING_REVIEW_REQUIRED");
  }
  const canonical = await getManagedArticleById(id);
  // Existing drafts are not evidence of an approved public pairing.
  return canonical?.status === "published" ? canonical : null;
}

const ARTICLE_EDITABLE_AUTHORITY_FIELDS = [
  "title","excerpt","intro","blocks","seoTitle","metaDescription","socialCaption","focusKeyword",
  "canonicalUrl","noindex","ogTitle","ogDescription","ogImageUrl",
] as const;
type ArticleAuthorityKey=(typeof ARTICLE_EDITABLE_AUTHORITY_FIELDS)[number];
function articleCurrentField(existing:ManagedArticle,key:ArticleAuthorityKey):unknown{
  switch(key){
    case "seoTitle": return existing.seo?.title??"";
    case "metaDescription": return existing.seo?.description??"";
    case "focusKeyword": return existing.seo?.focusKeyword??"";
    case "canonicalUrl": return existing.seo?.canonicalUrl??"";
    case "noindex": return existing.seo?.noindex??false;
    case "ogTitle": return existing.seo?.ogTitle??"";
    case "ogDescription": return existing.seo?.ogDescription??"";
    case "ogImageUrl": return existing.seo?.ogImage??null;
    case "socialCaption": return existing.socialCaption??"";
    default: return existing[key];
  }
}
/** Preserve canonical content for explicit Admin-owned editorial fields.
 * Publication, slug, placement, author, relations and image protections live elsewhere.
 */
function applyArticleAuthority(
  incoming:ManagedArticleInput,existing:ManagedArticle,
  modes:Readonly<Record<string,NotionFieldMode>>,
):ManagedArticleInput{
  const next={...incoming};
  for(const key of ARTICLE_EDITABLE_AUTHORITY_FIELDS){
    if(modes[key]!=="admin")continue;
    if(key==="intro"){
      next.intro=existing.intro;next.introRichText=existing.introRichText;
    }else if(key==="blocks"){
      next.blocks=existing.blocks;next.readingMinutes=existing.readingMinutes;
    }else{
      (next as Record<string,unknown>)[key]=articleCurrentField(existing,key);
      if(key==="ogImageUrl")next.ogImageKey=existing.ogImageKey;
    }
  }
  return next;
}
/** Never treat an article-wide updatedAt as proof of a field-level winner.
 * A locally changed field may be overwritten only by an explicit Notion decision;
 * Admin ownership preserves the local value. Other differing fields fail closed.
 */
function articleAuthorityCoversDifferences(
  incoming:ManagedArticleInput,existing:ManagedArticle,
  modes:Readonly<Record<string,NotionFieldMode>>,
):boolean{
  if(!Object.keys(modes).length)return false;
  return ARTICLE_EDITABLE_AUTHORITY_FIELDS.every(key=>{
    if(modes[key]==="admin"||modes[key]==="notion")return true;
    return JSON.stringify(articleCurrentField(existing,key)??null)===
      JSON.stringify(incoming[key]??null);
  });
}

/** Preserve rich HEX styling when Notion changes unrelated fields.
 * If source text actually differs, require explicit review instead of erasing
 * native Psipedia formatting during a background inbound synchronization. */
function hasPsipediaV2Styles(doc: EditorialRichTextDocument | null | undefined) {
  return Boolean(doc?.content.some(block => {
    const inline = "items" in block ? block.items.flat() : block.content;
    return inline.some(node => node.type === "text" &&
      node.marks?.some(mark => mark.type === "color" || mark.type === "highlight" || mark.type === "underline"));
  }));
}
function preserveNotionUnrepresentableStyles(
  incoming: ManagedArticleInput,
  existing: ManagedArticle,
  modes: Readonly<Record<string, NotionFieldMode>>,
): ManagedArticleInput {
  const next = { ...incoming };
  if (modes.intro !== "admin" && hasPsipediaV2Styles(existing.introRichText)) {
    if (incoming.intro !== existing.intro) throw new Error("NOTION_ARTICLE_STYLED_INTRO_REVIEW_REQUIRED");
    next.introRichText = existing.introRichText;
  }
  if (modes.blocks !== "admin") {
    const styledOld = (existing.blocks ?? []).filter(block =>
      "richText" in block && hasPsipediaV2Styles(block.richText));
    if (styledOld.length) {
      const proposed = next.blocks ?? [];
      for (const block of styledOld) {
        const match = proposed.find(item => item.id === block.id);
        if (!match || match.type !== block.type || !("content" in match) ||
          !("content" in block) || match.content !== block.content) {
          throw new Error("NOTION_ARTICLE_STYLED_BLOCK_REVIEW_REQUIRED");
        }
      }
      next.blocks = proposed.map(block => {
        const old = styledOld.find(item => item.id === block.id);
        return old && "richText" in old && "richText" in block ? { ...block, richText: old.richText } : block;
      }) as ArticleBlock[];
    }
  }
  return next;
}

async function syncOneNotionPage(
  database: D1Database,
  bindings: NotionSyncBindings,
  page: NotionPage,
): Promise<"created" | "updated" | "unchanged"> {
  // An in-flight editor writeback is not a valid Notion import baseline.
  // Check schema existence to keep legacy imports safe while the article outbox is only an unnumbered proposal.
  const journalTable = await database.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'article_notion_editorial_outbox'",
  ).first<{ name: string }>();
  if (journalTable) {
    const pending = await database.prepare(
      "SELECT article_id FROM article_notion_editorial_outbox WHERE notion_page_id = ? LIMIT 1",
    ).bind(page.id).first<{ article_id: number }>();
    if (pending) throw new Error("NOTION_EDITORIAL_WRITEBACK_PENDING");
  }
  const mapping = await loadMapping(database, page.id);
  const legacyUnapprovedReady = selectProperty(page, "Stav") === "Ready"
    && !checkboxProperty(page, "Odoslať na Psipedia")
    && richTextProperty(page, "Sync chyba").includes("Prepojený článok už nie je Draft");
  const previousSeo = mapping ? decodeArticleSeoReceipt(mapping.content_hash).seo : null;
  const mappedExisting = mapping ? await getManagedArticleById(Number(mapping.article_id)) : null;
  // Unapproved legacy Ready rows must never create a new draft or publish.
  if (legacyUnapprovedReady && (!mapping || mappedExisting?.status !== "published")) {
    return "unchanged";
  }
  // Review-only Notion drafts must not be treated as failed syncs. A public
  // canonical counterpart is the sole exception to their review-state gate.
  if (selectProperty(page, "Stav") === "Na kontrolu") {
    if (mapping && !mappedExisting) throw new Error("ARTICLE_MAPPING_ORPHAN");
    if (mapping && mappedExisting?.status !== "published") return "unchanged";
    if (!mapping) {
      const slug = richTextProperty(page, "Slug").trim();
      const published = slug ? await database.prepare(
        "SELECT id FROM managed_articles WHERE slug = ? AND status = 'published' LIMIT 1",
      ).bind(slug).first<{ id: number }>() : null;
      if (!published) return "unchanged";
    }
  }
  const blocks = await getPageBlocks(bindings, page.id);
  // Legacy article placements require the canonical mapped article for a
  // correct fallback; do not parse a mapped page without that context.
  const proposed = notionPageToManagedArticleInput(page, blocks, mappedExisting ?? undefined, previousSeo);
  const existing: ManagedArticle | null = mappedExisting
    ?? (mapping ? null : await findUnmappedCanonicalArticle(database, page, proposed));
  if (mapping && !existing) {
    throw new Error("Notion záznam je prepojený na chýbajúci článok v Psipedii.");
  }
  if (existing && (existing.slug !== proposed.slug || existing.portalSection !== proposed.portalSection)) {
    throw new Error("ARTICLE_IDENTITY_REVIEW_REQUIRED");
  }
  if (existing && existing.status !== "draft" && existing.status !== "published") {
    throw new Error("ARTICLE_STATUS_REVIEW_REQUIRED");
  }
  if (!existing && selectProperty(page, "Stav") === "Na kontrolu") return "unchanged";
  validateSyncGate(page, existing?.status === "published");

  const sourcePayload = notionPageToManagedArticleInput(page, blocks, existing ?? undefined, previousSeo);
  const articleModes = existing && mapping
    ? await readNotionFieldAuthorities(database,"articles") : {};
  const authorityPayload = existing && mapping
    ? applyArticleAuthority(sourcePayload,existing,articleModes) : sourcePayload;
  const basePayload = existing && mapping
    ? preserveNotionUnrepresentableStyles(authorityPayload, existing, articleModes)
    : authorityPayload;
  // Notion manifests bypass the Admin's published-article-only picker.
  // Resolve related article blocks against the currently public canonical URL.
  await assertPublishedRelatedBlocks(
    basePayload.blocks ?? [],
    basePayload.slug ?? "",
    async (slug) => {
      const published = await getPublishedArticle(slug);
      return published ? articleHref(published) : null;
    },
    SITE_URL,
  );
  const notionImageSourceUrl = urlProperty(page, "Hlavný obrázok URL");
  const notionImageFileIdentity = notionArticleMainImageSource(page).fileIdentity;
  const notionImageAlt = richTextProperty(page, "Alt text obrázka");
  const notionImageCreditUrl = urlProperty(page, "Zdroj obrázka");
  const contentHash = await sha256(JSON.stringify({
    payload: sourcePayload,
    notionImageSourceUrl,
    ...(notionImageFileIdentity ? { notionImageFileIdentity } : {}),
    notionImageAlt,
    notionImageCreditUrl,
  }));
  const now = new Date().toISOString();

  if (legacyUnapprovedReady) {
    // Metadata-only repair: keep the opt-in false and public content intact.
    if (!mapping || !existing || existing.status !== "published"
      || richTextProperty(page, "Psipedia ID") !== String(existing.id)) {
      throw new Error("ARTICLE_LEGACY_READY_IDENTITY_REVIEW_REQUIRED");
    }
    if (decodeArticleSeoReceipt(mapping.content_hash).hash !== contentHash) {
      throw new Error("ARTICLE_LEGACY_READY_CONTENT_REVIEW_REQUIRED");
    }
    const receiptTime = Date.parse(mapping.last_synced_at);
    const adminTime = Date.parse(existing.updatedAt);
    if (existing.updatedBy !== SYNC_ACTOR
      && (!Number.isFinite(receiptTime) || !Number.isFinite(adminTime)
        || adminTime > receiptTime)) {
      throw new Error("ADMIN_UNACKNOWLEDGED_EDITORIAL_REVISION");
    }
    await upsertMapping(database, page, existing.id, contentHash, now);
    await updateNotionSyncState(bindings, page.id, {
      state: "Synchronizované", articleId: existing.id, syncedAt: now,
    });
    return "unchanged";
  }

  if (existing) {
    if (mapping && decodeArticleSeoReceipt(mapping.content_hash).hash === contentHash) {
      // Hash equality proves only that Notion did not change. It does NOT
      // prove a newer human Admin edit was written back successfully.
      // Keep the last-success receipt intact until the editor revision has
      // an acknowledged writeback, rather than falsely marking "synced".
      const receiptTime = Date.parse(mapping.last_synced_at);
      const adminTime = Date.parse(existing.updatedAt);
      if (existing.updatedBy !== SYNC_ACTOR &&
        (!Number.isFinite(receiptTime) || !Number.isFinite(adminTime) || adminTime > receiptTime)) {
        throw new Error("ADMIN_UNACKNOWLEDGED_EDITORIAL_REVISION");
      }
      if (selectProperty(page, "Sync stav") === "Synchronizované"
        && richTextProperty(page, "Psipedia ID") === String(existing.id)) {
        // The first safe read of an old hash-only row establishes the raw SEO
        // baseline without treating legacy empty Notion fields as clears.
        if (!previousSeo) await upsertMapping(database, page, existing.id, contentHash, now);
        return "unchanged"; // No metadata-only writeback loop.
      }
      await upsertMapping(database, page, existing.id, contentHash, now);
      await updateNotionSyncState(bindings, page.id, {
        state: "Synchronizované",
        articleId: existing.id,
        syncedAt: now,
      });
      return "unchanged";
    }

    // A locally edited draft belongs to the editor, not to the next Notion sweep.
    // Hash-only checks cannot detect admin edits after the previous import.
    if (existing.status === "published") {
      // The article remains published with its original URL, assets, topic
      // relations, author and moderation state. Only Notion editorial fields
      // (body, intro, title, excerpt, SEO and social caption) flow inbound.
      if (mapping && existing.updatedBy !== SYNC_ACTOR
        && (!Number.isFinite(Date.parse(mapping.last_synced_at))
          || Date.parse(existing.updatedAt) > Date.parse(mapping.last_synced_at) + 2_000)
        && !articleAuthorityCoversDifferences(sourcePayload,existing,articleModes)) {
        throw new Error("ARTICLE_ADMIN_REVISION_NOT_SYNCED");
      }
      const publishedPayload: ManagedArticleInput = {
        ...existing,
        ...basePayload,
        status: existing.status,
        publishedAt: existing.publishedAt,
        slug: existing.slug,
        category: existing.category,
        portalSection: existing.portalSection,
        portalSubpage: existing.portalSubpage,
        newsCategory: existing.newsCategory,
        accent: existing.accent,
        author: existing.author,
        authorProfileId: existing.authorProfileId,
        relatedBreedIds: existing.relatedBreedIds,
        sections: existing.sections,
        sources: existing.sources,
        takeaway: existing.takeaway,
        takeawayRichText: existing.takeawayRichText,
        imageUrl: existing.image,
        imageKey: existing.imageKey,
        contentUpdatedAt: now,
        showUpdated: existing.showUpdated,
        blocks: preserveArticlePromoBlocks(existing.blocks ?? [], basePayload.blocks ?? []),
      };
      const updated = await updateManagedArticle(existing.id, publishedPayload, SYNC_ACTOR, existing, {
        updatedAt: existing.updatedAt,
      });
      if (!updated) throw new Error("ARTICLE_PUBLISHED_UPDATE_FAILED");
      await upsertMapping(database, page, updated.id, contentHash, now);
      await updateNotionSyncState(bindings, page.id, {
        state: "Synchronizované", articleId: updated.id, syncedAt: now,
      });
      return "updated";
    }
    // Drafts retain the existing Admin-authority conflict contract.
    if (mapping && existing.updatedBy !== SYNC_ACTOR
      && !articleAuthorityCoversDifferences(sourcePayload,existing,articleModes)) {
      throw new Error("Prepojený koncept bol upravený v administrácii. Automatický sync ho neprepíše; zmeny treba zosúladiť ručne.");
    }
    const preservedPayload: ManagedArticleInput = {
      ...basePayload,
      blocks: preserveArticlePromoBlocks(existing.blocks ?? [], basePayload.blocks ?? []),
    };
    const previouslyClearedOg = previousSeo?.ogImageUrl === "" &&
      !urlProperty(page, SEO.ogImageUrl.name) &&
      !existing.seo?.ogImage && !existing.ogImageKey;
    const prepared = await prepareNotionMainImage(bindings, page, preservedPayload, existing,
      articleSeoExplicitClears(page, previousSeo).has("ogImageUrl") || previouslyClearedOg);
    let updated: Awaited<ReturnType<typeof updateManagedArticle>> | null = null;
    try {
      updated = await updateManagedArticle(existing.id, prepared.payload, SYNC_ACTOR, existing, { updatedAt: existing.updatedAt, status: "draft" });
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

  if (selectProperty(page, "Stav") !== "Ready" || !checkboxProperty(page, "Odoslať na Psipedia")) {
    throw new Error("ARTICLE_CREATE_REQUIRES_READY");
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
  targetPageId?: string;
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

  let pages: NotionPage[];
  if (args.targetPageId !== undefined) {
    if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(args.targetPageId))
      throw new Error("NOTION_ARTICLE_TARGET_INVALID");
    const page = await notionRequest<NotionPage>(args.bindings, "/pages/" + encodeURIComponent(args.targetPageId));
    const dataSourceId = args.bindings.NOTION_ARTICLES_DATA_SOURCE_ID?.trim() ?? "";
    if (page.id !== args.targetPageId || page.archived || page.in_trash
      || page.parent?.type !== "data_source_id" || !dataSourceId
      || page.parent.data_source_id?.replaceAll("-", "").toLowerCase() !== dataSourceId.replaceAll("-", "").toLowerCase())
      throw new Error("NOTION_ARTICLE_TARGET_UNSAFE");
    pages = [page];
  } else {
    pages = await listReadyNotionPages(args.bindings);
  }
  for (const page of pages) {
    if (summary.created + summary.updated >= MAX_EDITORIAL_UPDATES_PER_SWEEP) break;
    if (await notionPageMustSkipInboundSync(args.database,page.id)) {summary.unchanged += 1;continue;}
    summary.scanned += 1;
    try {
      const result = await syncOneNotionPage(args.database, args.bindings, page);
      summary[result] += 1;
    } catch (error) {
      summary.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      // The content-writeback outbox is authoritative while unfinished.
      // Do not overwrite its Notion status with an import-sweep error.
      if (message === "NOTION_EDITORIAL_WRITEBACK_PENDING") continue;
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
  await recordNotionTransfer(args.database,"articles","NOTION_TO_ADMIN",summary.created+summary.updated);
  return summary;
}
