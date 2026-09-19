export type NotionSyncBindings = {
  NOTION_API_TOKEN?: string;
  BUCKET?: R2Bucket;
};

export type NotionPage = {
  id: string;
  last_edited_time?: string;
  properties?: Record<string, unknown>;
};

type NotionQueryResponse = {
  results?: NotionPage[];
  has_more?: boolean;
  next_cursor?: string | null;
};

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2025-09-03";
const MAX_REMOTE_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_REMOTE_IMAGE_REDIRECTS = 3;
const REMOTE_IMAGE_EXTENSIONS = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
]);

export function notionFlagEnabled(value: unknown) {
  return typeof value === "string" && (value === "1" || value.toLowerCase() === "true");
}

export function notionPropertyRecord(page: NotionPage, name: string) {
  const value = page.properties?.[name];
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

export function notionRichTextPlainText(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value.map((item) => {
    if (!item || typeof item !== "object") return "";
    const record = item as Record<string, unknown>;
    return typeof record.plain_text === "string" ? record.plain_text : "";
  }).join("").replace(/\s+/g, " ").trim();
}

export function notionTitleProperty(page: NotionPage, name: string) {
  return notionRichTextPlainText(notionPropertyRecord(page, name)?.title);
}

export function notionRichTextProperty(page: NotionPage, name: string) {
  return notionRichTextPlainText(notionPropertyRecord(page, name)?.rich_text);
}

export function notionUrlProperty(page: NotionPage, name: string) {
  const value = notionPropertyRecord(page, name)?.url;
  return typeof value === "string" ? value.trim() : "";
}

export function notionSelectProperty(page: NotionPage, name: string) {
  const select = notionPropertyRecord(page, name)?.select;
  return select && typeof select === "object" && typeof (select as Record<string, unknown>).name === "string"
    ? String((select as Record<string, unknown>).name)
    : "";
}

export function notionNumberProperty(page: NotionPage, name: string) {
  const value = notionPropertyRecord(page, name)?.number;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function notionDateStartProperty(page: NotionPage, name: string) {
  const value = notionPropertyRecord(page, name)?.date;
  if (!value || typeof value !== "object") return "";
  const start = (value as Record<string, unknown>).start;
  return typeof start === "string" ? start : "";
}

export function notionTextValue(value: string) {
  return { rich_text: value ? [{ type: "text", text: { content: value.slice(0, 1900) } }] : [] };
}

export async function notionRequest<T>(
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
      // Keep the plain response body.
    }
    throw new Error(`Notion API ${response.status}: ${message}`);
  }
  return text ? JSON.parse(text) as T : {} as T;
}

export async function listReadyNotionPages(
  bindings: NotionSyncBindings,
  dataSourceId: string,
  maxItems = 100,
) {
  const id = dataSourceId.trim();
  if (!id) throw new Error("Notion data-source ID nie je nakonfigurované.");

  const results: NotionPage[] = [];
  let cursor: string | null = null;
  do {
    const pageSize = Math.min(100, maxItems - results.length);
    const response = await notionRequest<NotionQueryResponse>(
      bindings,
      `/data_sources/${encodeURIComponent(id)}/query`,
      {
        method: "POST",
        body: JSON.stringify({
          filter: { property: "Stav", select: { equals: "Ready" } },
          sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
          page_size: pageSize,
          ...(cursor ? { start_cursor: cursor } : {}),
        }),
      },
    );
    results.push(...(response.results ?? []));
    cursor = response.has_more && response.next_cursor ? response.next_cursor : null;
  } while (cursor && results.length < maxItems);

  return results.slice(0, maxItems);
}

export async function updateNotionSyncState(
  bindings: NotionSyncBindings,
  pageId: string,
  values: {
    state: "Synchronizované" | "Chyba";
    psipediaId?: number;
    error?: string;
    syncedAt?: string;
    extraProperties?: Record<string, unknown>;
  },
) {
  const properties: Record<string, unknown> = {
    "Sync stav": { select: { name: values.state } },
    "Sync chyba": notionTextValue(values.error ?? ""),
    ...(values.extraProperties ?? {}),
  };
  if (values.psipediaId) properties["Psipedia ID"] = notionTextValue(String(values.psipediaId));
  if (values.syncedAt) properties["Posledný sync"] = { date: { start: values.syncedAt } };

  await notionRequest(
    bindings,
    `/pages/${encodeURIComponent(pageId)}`,
    { method: "PATCH", body: JSON.stringify({ properties }) },
  );
}

export async function sha256Text(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
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

async function downloadRemoteImage(sourceUrl: string) {
  let url = safeRemoteImageUrl(sourceUrl);

  for (let redirectCount = 0; redirectCount <= MAX_REMOTE_IMAGE_REDIRECTS; redirectCount += 1) {
    const response = await fetch(url.toString(), {
      redirect: "manual",
      headers: { Accept: "image/avif,image/webp,image/png,image/jpeg" },
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

export type PreparedNotionImage = {
  imageUrl: string | null;
  imageKey: string | null;
  uploadedKey: string | null;
  replacedKeys: string[];
};

export async function prepareNotionMainImage(args: {
  bindings: NotionSyncBindings;
  sourceUrl: string;
  sourcePageUrl?: string;
  altText?: string;
  folder: "articles" | "breeds" | "events" | "directory" | "help" | "adoptions";
  existingImageUrl?: string | null;
  existingImageKey?: string | null;
}): Promise<PreparedNotionImage> {
  const sourceUrl = args.sourceUrl.trim();
  if (!sourceUrl) {
    return {
      imageUrl: args.existingImageUrl ?? null,
      imageKey: args.existingImageKey ?? null,
      uploadedKey: null,
      replacedKeys: [],
    };
  }

  const bucket = args.bindings.BUCKET;
  if (!bucket) {
    throw new Error("Cloudflare R2 úložisko nie je pripojené; hlavný obrázok sa nedá synchronizovať.");
  }

  const sourceFingerprint = await sha256Text(sourceUrl);
  if (args.existingImageKey) {
    const currentObject = await bucket.head(args.existingImageKey);
    if (currentObject?.customMetadata?.notionSourceHash === sourceFingerprint) {
      return {
        imageUrl: args.existingImageUrl || `/media/${args.existingImageKey}`,
        imageKey: args.existingImageKey,
        uploadedKey: null,
        replacedKeys: [],
      };
    }
  }

  const remote = await downloadRemoteImage(sourceUrl);
  const key = `${args.folder}/${new Date().getUTCFullYear()}/${crypto.randomUUID()}.${remote.extension}`;
  const imageUrl = `/media/${key}`;

  await bucket.put(key, remote.bytes, {
    httpMetadata: {
      contentType: remote.contentType,
      cacheControl: "public, max-age=31536000, immutable",
    },
    customMetadata: {
      source: "notion-sync",
      notionSourceHash: sourceFingerprint,
      notionSourceUrl: sourceUrl.slice(0, 400),
      imageSourceUrl: (args.sourcePageUrl ?? "").slice(0, 400),
      altText: (args.altText ?? "").slice(0, 250),
    },
  });

  return {
    imageUrl,
    imageKey: key,
    uploadedKey: key,
    replacedKeys: args.existingImageKey && args.existingImageKey !== key ? [args.existingImageKey] : [],
  };
}

export async function cleanupNotionImageKeys(
  bucket: R2Bucket | undefined,
  keys: Array<string | null | undefined>,
) {
  if (!bucket) return;
  const unique = [...new Set(keys.filter((value): value is string => Boolean(value)))];
  await Promise.all(unique.map((key) => bucket.delete(key).catch(() => undefined)));
}
