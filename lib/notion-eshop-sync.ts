import { SITE_URL } from "@/config/public-site";
import {
  createManagedEshop,
  getManagedEshopById,
  updateManagedEshop,
  type ManagedEshop,
  type ManagedEshopUpdateInput,
} from "@/lib/eshop-ratings";
import {
  cleanupNotionImageKeys,
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
  type NotionSyncBindings,
} from "@/lib/notion-sync-shared";

export type NotionEshopSyncBindings = NotionSyncBindings & {
  NOTION_ESHOP_SYNC_ENABLED?: string;
  NOTION_ESHOPS_DATA_SOURCE_ID?: string;
};

type NotionPage = {
  id: string;
  last_edited_time?: string;
  properties?: Record<string, unknown>;
};

type NotionQueryResponse = {
  results?: NotionPage[];
};

type EshopNotionMapping = {
  notion_page_id: string;
  eshop_id: number;
  content_hash: string;
  notion_last_edited_time: string | null;
  psipedia_updated_at: string | null;
  last_synced_at: string;
};

type EditableSnapshot = {
  slug: string;
  name: string;
  status: "draft" | "published" | "archived";
  websiteUrl: string;
  description: string;
  sourceUrl: string;
  focusTags: string[];
  logoUrl: string;
};

export type NotionEshopSyncSummary = {
  enabled: boolean;
  schemaReady: boolean;
  notionScanned: number;
  bootstrapped: number;
  createdFromNotion: number;
  pulledFromNotion: number;
  pushedToNotion: number;
  unchanged: number;
  failed: number;
};

export type NotionEshopBootstrapSummary = {
  enabled: boolean;
  schemaReady: boolean;
  selected: number;
  bootstrapped: number;
  failed: number;
  hasMore: boolean;
};

const SYSTEM_ACTOR = "notion-eshop-sync@psipedia.sk";
const BOOTSTRAP_BATCH = 20;
const CHANGED_BATCH = 20;
const NOTION_SCAN_BATCH = 40;

function clean(value: unknown) {
  return typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim() : "";
}

function absoluteAsset(value: string | null | undefined) {
  const source = clean(value);
  if (!source) return "";
  return source.startsWith("/") ? SITE_URL + source : source;
}

function localizeOwnAsset(value: string) {
  const source = clean(value);
  if (!source) return null;
  if (source.startsWith(SITE_URL + "/media/") || source.startsWith(SITE_URL + "/images/")) {
    return source.slice(SITE_URL.length);
  }
  if (source.startsWith("/media/") || source.startsWith("/images/")) return source;
  return null;
}

function statusFromNotion(value: string): EditableSnapshot["status"] {
  if (value === "Publikované") return "published";
  if (value === "Archív") return "archived";
  return "draft";
}

function statusToNotion(value: EditableSnapshot["status"]) {
  if (value === "published") return "Publikované";
  if (value === "archived") return "Archív";
  return "Koncept";
}

function multiSelectProperty(page: NotionPage, name: string) {
  const values = notionPropertyRecord(page, name)?.multi_select;
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of values) {
    if (!item || typeof item !== "object") continue;
    const value = clean((item as Record<string, unknown>).name);
    const key = value.toLocaleLowerCase("sk-SK");
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= 12) break;
  }
  return out;
}

function profileSnapshot(shop: ManagedEshop): EditableSnapshot {
  return {
    slug: clean(shop.slug),
    name: clean(shop.name),
    status: shop.status,
    websiteUrl: clean(shop.websiteUrl),
    description: clean(shop.description),
    sourceUrl: clean(shop.sourceUrl),
    focusTags: shop.focusTags.map(clean).filter(Boolean),
    logoUrl: absoluteAsset(shop.logoUrl),
  };
}

function notionSnapshot(page: NotionPage): EditableSnapshot {
  return {
    slug: notionRichTextProperty(page, "Slug"),
    name: notionTitleProperty(page, "Názov"),
    status: statusFromNotion(notionSelectProperty(page, "Psipedia stav")),
    websiteUrl: notionUrlProperty(page, "Web"),
    description: notionRichTextProperty(page, "Popis"),
    sourceUrl: notionUrlProperty(page, "Zdroj"),
    focusTags: multiSelectProperty(page, "Zameranie"),
    logoUrl: notionUrlProperty(page, "Logo URL"),
  };
}

async function snapshotHash(snapshot: EditableSnapshot) {
  return sha256Text(JSON.stringify(snapshot));
}

function title(value: string) {
  return { title: value ? [{ type: "text", text: { content: value.slice(0, 1900) } }] : [] };
}

function select(value: string) {
  return { select: value ? { name: value } : null };
}

function url(value: string) {
  return { url: value || null };
}

function date(value: string | null | undefined) {
  return { date: value ? { start: value } : null };
}

function number(value: number | null | undefined) {
  return { number: typeof value === "number" && Number.isFinite(value) ? value : null };
}

function multiSelect(values: string[]) {
  return { multi_select: values.slice(0, 12).map((name) => ({ name })) };
}

function notionProperties(shop: ManagedEshop, hash: string, syncedAt: string) {
  return {
    "Názov": title(shop.name),
    "Psipedia ID": notionTextValue(String(shop.id)),
    "Slug": notionTextValue(shop.slug),
    "Psipedia stav": select(statusToNotion(shop.status)),
    "Web": url(shop.websiteUrl),
    "Popis": notionTextValue(shop.description),
    "Zdroj": url(shop.sourceUrl),
    "Zameranie": multiSelect(shop.focusTags),
    "Logo URL": url(absoluteAsset(shop.logoUrl)),
    "Logo Psipedia": url(absoluteAsset(shop.logoUrl)),
    "Logo key": notionTextValue(shop.logoKey ?? ""),
    "URL Psipedia": url(SITE_URL + "/recenzie/eshopy/" + shop.slug),
    "Počet hodnotení": number(shop.ratingCount),
    "Celkové hodnotenie": number(shop.averages?.overall ?? null),
    "Doručenie": number(shop.averages?.delivery ?? null),
    "Komunikácia": number(shop.averages?.communication ?? null),
    "Sortiment": number(shop.averages?.assortment ?? null),
    "Ceny": number(shop.averages?.price ?? null),
    "Vytvorené Psipedia": date(shop.createdAt),
    "Aktualizované Psipedia": date(shop.updatedAt),
    "Publikované Psipedia": date(shop.publishedAt),
    "Vytvoril": notionTextValue("Psipedia"),
    "Upravil": notionTextValue("Psipedia / Notion sync"),
    "Sync hash": notionTextValue(hash),
    "Sync stav": select("Synchronizované"),
    "Sync chyba": notionTextValue(""),
    "Posledný sync": date(syncedAt),
  };
}

async function schemaReady(database: D1Database) {
  const row = await database.prepare(
    "SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='eshop_notion_sync' LIMIT 1",
  ).first<{ ok: number }>();
  return Boolean(row?.ok);
}

async function loadMappingByShop(database: D1Database, shopId: number) {
  return database.prepare("SELECT * FROM eshop_notion_sync WHERE eshop_id=? LIMIT 1")
    .bind(shopId).first<EshopNotionMapping>();
}

async function loadMappingByPage(database: D1Database, pageId: string) {
  return database.prepare("SELECT * FROM eshop_notion_sync WHERE notion_page_id=? LIMIT 1")
    .bind(pageId).first<EshopNotionMapping>();
}

async function saveMapping(input: {
  database: D1Database;
  pageId: string;
  shopId: number;
  contentHash: string;
  notionLastEditedTime?: string | null;
  psipediaUpdatedAt?: string | null;
  syncedAt: string;
}) {
  await input.database.prepare(
    "INSERT INTO eshop_notion_sync (" +
    "notion_page_id,eshop_id,content_hash,notion_last_edited_time,psipedia_updated_at,last_synced_at,created_at,updated_at" +
    ") VALUES (?1,?2,?3,?4,?5,?6,?6,?6) " +
    "ON CONFLICT(eshop_id) DO UPDATE SET " +
    "notion_page_id=excluded.notion_page_id,content_hash=excluded.content_hash," +
    "notion_last_edited_time=excluded.notion_last_edited_time,psipedia_updated_at=excluded.psipedia_updated_at," +
    "last_synced_at=excluded.last_synced_at,updated_at=excluded.updated_at",
  ).bind(
    input.pageId,
    input.shopId,
    input.contentHash,
    input.notionLastEditedTime ?? null,
    input.psipediaUpdatedAt ?? null,
    input.syncedAt,
  ).run();
}

async function fetchPage(bindings: NotionEshopSyncBindings, pageId: string) {
  return notionRequest<NotionPage>(bindings, "/pages/" + encodeURIComponent(pageId));
}

async function patchPage(bindings: NotionEshopSyncBindings, pageId: string, properties: Record<string, unknown>) {
  return notionRequest<NotionPage>(bindings, "/pages/" + encodeURIComponent(pageId), {
    method: "PATCH",
    body: JSON.stringify({ properties }),
  });
}

async function createPage(
  bindings: NotionEshopSyncBindings,
  dataSourceId: string,
  properties: Record<string, unknown>,
) {
  return notionRequest<NotionPage>(bindings, "/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { type: "data_source_id", data_source_id: dataSourceId },
      properties,
    }),
  });
}

async function markPageError(bindings: NotionEshopSyncBindings, pageId: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  await patchPage(bindings, pageId, {
    "Sync stav": select("Chyba"),
    "Sync chyba": notionTextValue(message.slice(0, 1800)),
    "Posledný sync": date(new Date().toISOString()),
  }).catch(() => undefined);
}

async function writeShopToNotion(input: {
  database: D1Database;
  bindings: NotionEshopSyncBindings;
  dataSourceId: string;
  shop: ManagedEshop;
  pageId?: string | null;
}) {
  const syncedAt = new Date().toISOString();
  const hash = await snapshotHash(profileSnapshot(input.shop));
  const properties = notionProperties(input.shop, hash, syncedAt);
  const page = input.pageId
    ? await patchPage(input.bindings, input.pageId, properties)
    : await createPage(input.bindings, input.dataSourceId, properties);

  await saveMapping({
    database: input.database,
    pageId: page.id,
    shopId: input.shop.id,
    contentHash: hash,
    notionLastEditedTime: page.last_edited_time ?? syncedAt,
    psipediaUpdatedAt: input.shop.updatedAt,
    syncedAt,
  });
}

function readyForCreate(page: NotionPage) {
  if (notionRichTextProperty(page, "Psipedia ID")) return false;
  const desired = notionSnapshot(page);
  const rawStatus = notionSelectProperty(page, "Psipedia stav");
  return Boolean(
    (rawStatus === "Koncept" || rawStatus === "Publikované")
    && desired.name
    && /^[a-z0-9-]{1,100}$/.test(desired.slug)
    && desired.websiteUrl
    && desired.description
    && desired.sourceUrl
  );
}

async function prepareLogo(bindings: NotionEshopSyncBindings, desiredUrl: string, current?: ManagedEshop | null) {
  const source = clean(desiredUrl);
  if (!source) {
    return {
      imageUrl: null as string | null,
      imageKey: null as string | null,
      uploadedKey: null as string | null,
      replacedKeys: current?.logoKey ? [current.logoKey] : [] as string[],
    };
  }

  const own = localizeOwnAsset(source);
  if (own) {
    const key = own.startsWith("/media/") ? own.slice("/media/".length) : null;
    return {
      imageUrl: own,
      imageKey: key,
      uploadedKey: null as string | null,
      replacedKeys: current?.logoKey && current.logoKey !== key ? [current.logoKey] : [] as string[],
    };
  }

  return prepareNotionMainImage({
    bindings,
    sourceUrl: source,
    sourcePageUrl: current?.websiteUrl ?? source,
    altText: current?.name ?? "Logo e-shopu",
    folder: "eshops",
    existingImageUrl: current?.logoUrl ?? null,
    existingImageKey: current?.logoKey ?? null,
  });
}

function updateInput(
  snapshot: EditableSnapshot,
  logo: { imageUrl: string | null; imageKey: string | null },
): ManagedEshopUpdateInput {
  return {
    name: snapshot.name,
    slug: snapshot.slug,
    websiteUrl: snapshot.websiteUrl,
    description: snapshot.description,
    sourceUrl: snapshot.sourceUrl,
    logoUrl: logo.imageUrl,
    logoKey: logo.imageKey,
    focusTags: snapshot.focusTags,
    status: snapshot.status,
  };
}

async function createFromNotion(input: {
  database: D1Database;
  bindings: NotionEshopSyncBindings;
  page: NotionPage;
}) {
  const desired = notionSnapshot(input.page);
  const logo = await prepareLogo(input.bindings, desired.logoUrl, null);
  try {
    return await createManagedEshop(updateInput(desired, logo), SYSTEM_ACTOR, input.database);
  } catch (error) {
    if (logo.uploadedKey) await cleanupNotionImageKeys(input.bindings.BUCKET, [logo.uploadedKey]);
    throw error;
  }
}

async function applyNotionToShop(input: {
  database: D1Database;
  bindings: NotionEshopSyncBindings;
  page: NotionPage;
  shop: ManagedEshop;
}) {
  const desired = notionSnapshot(input.page);
  const logo = await prepareLogo(input.bindings, desired.logoUrl, input.shop);
  try {
    const updated = await updateManagedEshop(
      input.shop.id,
      updateInput(desired, logo),
      SYSTEM_ACTOR,
      input.database,
    );
    if (!updated) throw new Error("E-shop sa pri synchronizácii nepodarilo uložiť.");
    await cleanupNotionImageKeys(input.bindings.BUCKET, logo.replacedKeys);
    return updated;
  } catch (error) {
    if (logo.uploadedKey) await cleanupNotionImageKeys(input.bindings.BUCKET, [logo.uploadedKey]);
    throw error;
  }
}

async function recentPages(bindings: NotionEshopSyncBindings, dataSourceId: string) {
  const response = await notionRequest<NotionQueryResponse>(
    bindings,
    "/data_sources/" + encodeURIComponent(dataSourceId) + "/query",
    {
      method: "POST",
      body: JSON.stringify({
        sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
        page_size: NOTION_SCAN_BATCH,
      }),
    },
  );
  return response.results ?? [];
}

async function bootstrapIds(database: D1Database) {
  const result = await database.prepare(
    "SELECT shop.id FROM managed_eshops shop " +
    "LEFT JOIN eshop_notion_sync ens ON ens.eshop_id=shop.id " +
    "WHERE ens.eshop_id IS NULL ORDER BY shop.id ASC LIMIT ?1",
  ).bind(BOOTSTRAP_BATCH).all<{ id: number }>();
  return (result.results ?? []).map((row) => Number(row.id)).filter(Number.isSafeInteger);
}

async function changedIds(database: D1Database) {
  const result = await database.prepare(
    "SELECT shop.id FROM managed_eshops shop " +
    "JOIN eshop_notion_sync ens ON ens.eshop_id=shop.id " +
    "WHERE COALESCE(ens.psipedia_updated_at,'') <> shop.updated_at " +
    "OR EXISTS (SELECT 1 FROM eshop_ratings rating WHERE rating.eshop_id=shop.id AND rating.updated_at > ens.last_synced_at) " +
    "ORDER BY shop.updated_at ASC, shop.id ASC LIMIT ?1",
  ).bind(CHANGED_BATCH).all<{ id: number }>();
  return (result.results ?? []).map((row) => Number(row.id)).filter(Number.isSafeInteger);
}

async function recoverMapping(input: { database: D1Database; page: NotionPage }) {
  const shopId = Number.parseInt(notionRichTextProperty(input.page, "Psipedia ID"), 10);
  if (!Number.isSafeInteger(shopId) || shopId <= 0) return null;
  const shop = await getManagedEshopById(shopId, input.database);
  if (!shop) return null;

  const existing = await loadMappingByShop(input.database, shopId);
  if (existing && existing.notion_page_id !== input.page.id) {
    throw new Error("Psipedia e-shop ID " + shopId + " už je prepojený s iným Notion záznamom.");
  }

  const hash = await snapshotHash(profileSnapshot(shop));
  const syncedAt = new Date().toISOString();
  await saveMapping({
    database: input.database,
    pageId: input.page.id,
    shopId,
    contentHash: notionRichTextProperty(input.page, "Sync hash") || hash,
    notionLastEditedTime: input.page.last_edited_time ?? null,
    psipediaUpdatedAt: shop.updatedAt,
    syncedAt,
  });
  return loadMappingByShop(input.database, shopId);
}

async function syncMapped(input: {
  database: D1Database;
  bindings: NotionEshopSyncBindings;
  dataSourceId: string;
  mapping: EshopNotionMapping;
  page?: NotionPage;
  forcePush?: boolean;
}) {
  const shop = await getManagedEshopById(input.mapping.eshop_id, input.database);
  if (!shop) return "unchanged" as const;
  const page = input.page ?? await fetchPage(input.bindings, input.mapping.notion_page_id);

  if (notionRichTextProperty(page, "Psipedia ID") !== String(shop.id)) {
    await writeShopToNotion({ database: input.database, bindings: input.bindings, dataSourceId: input.dataSourceId, shop, pageId: page.id });
    return "pushed" as const;
  }

  const profileHash = await snapshotHash(profileSnapshot(shop));
  const pageHash = await snapshotHash(notionSnapshot(page));
  const lastHash = input.mapping.content_hash;
  const profileChanged = profileHash !== lastHash;
  const notionChanged = pageHash !== lastHash;

  if (!profileChanged && !notionChanged) {
    const metadataChanged = (page.last_edited_time ?? null) !== input.mapping.notion_last_edited_time;
    if (input.forcePush || metadataChanged) {
      await writeShopToNotion({ database: input.database, bindings: input.bindings, dataSourceId: input.dataSourceId, shop, pageId: page.id });
      return "pushed" as const;
    }
    return "unchanged" as const;
  }

  let notionWins = notionChanged && !profileChanged;
  if (notionChanged && profileChanged) {
    const notionTime = Date.parse(page.last_edited_time ?? "");
    const profileTime = Date.parse(shop.updatedAt);
    notionWins = Number.isFinite(notionTime) && (!Number.isFinite(profileTime) || notionTime > profileTime);
  }

  if (notionWins) {
    const updated = await applyNotionToShop({ database: input.database, bindings: input.bindings, page, shop });
    await writeShopToNotion({ database: input.database, bindings: input.bindings, dataSourceId: input.dataSourceId, shop: updated, pageId: page.id });
    return "pulled" as const;
  }

  await writeShopToNotion({ database: input.database, bindings: input.bindings, dataSourceId: input.dataSourceId, shop, pageId: page.id });
  return "pushed" as const;
}

function configured(bindings: NotionEshopSyncBindings) {
  return notionFlagEnabled(bindings.NOTION_ESHOP_SYNC_ENABLED)
    && Boolean(bindings.NOTION_API_TOKEN?.trim())
    && Boolean(bindings.NOTION_ESHOPS_DATA_SOURCE_ID?.trim());
}

export async function runNotionEshopBootstrapSweep(input: {
  database: D1Database;
  bindings: NotionEshopSyncBindings;
}): Promise<NotionEshopBootstrapSummary> {
  const summary: NotionEshopBootstrapSummary = {
    enabled: configured(input.bindings),
    schemaReady: false,
    selected: 0,
    bootstrapped: 0,
    failed: 0,
    hasMore: false,
  };
  if (!summary.enabled) return summary;
  summary.schemaReady = await schemaReady(input.database);
  if (!summary.schemaReady) return summary;

  const dataSourceId = input.bindings.NOTION_ESHOPS_DATA_SOURCE_ID!.trim();
  const ids = await bootstrapIds(input.database);
  summary.selected = ids.length;

  for (const id of ids) {
    try {
      const shop = await getManagedEshopById(id, input.database);
      if (!shop) continue;
      await writeShopToNotion({ database: input.database, bindings: input.bindings, dataSourceId, shop });
      summary.bootstrapped += 1;
    } catch (error) {
      summary.failed += 1;
      console.error(JSON.stringify({
        event: "notion_eshop_bootstrap_item",
        eshopId: id,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  summary.hasMore = (await bootstrapIds(input.database)).length > 0;
  return summary;
}

export async function runNotionEshopSyncSweep(input: {
  database: D1Database;
  bindings: NotionEshopSyncBindings;
}): Promise<NotionEshopSyncSummary> {
  const summary: NotionEshopSyncSummary = {
    enabled: configured(input.bindings),
    schemaReady: false,
    notionScanned: 0,
    bootstrapped: 0,
    createdFromNotion: 0,
    pulledFromNotion: 0,
    pushedToNotion: 0,
    unchanged: 0,
    failed: 0,
  };
  if (!summary.enabled) return summary;
  summary.schemaReady = await schemaReady(input.database);
  if (!summary.schemaReady) return summary;

  const dataSourceId = input.bindings.NOTION_ESHOPS_DATA_SOURCE_ID!.trim();
  const bootstrap = await runNotionEshopBootstrapSweep(input);
  summary.bootstrapped += bootstrap.bootstrapped;
  summary.failed += bootstrap.failed;

  const pages = await recentPages(input.bindings, dataSourceId);
  summary.notionScanned = pages.length;

  for (const page of pages) {
    try {
      let mapping = await loadMappingByPage(input.database, page.id);
      if (!mapping) mapping = await recoverMapping({ database: input.database, page });

      if (!mapping && readyForCreate(page)) {
        const created = await createFromNotion({ database: input.database, bindings: input.bindings, page });
        await writeShopToNotion({ database: input.database, bindings: input.bindings, dataSourceId, shop: created, pageId: page.id });
        summary.createdFromNotion += 1;
        continue;
      }

      if (!mapping) {
        summary.unchanged += 1;
        continue;
      }

      const action = await syncMapped({ database: input.database, bindings: input.bindings, dataSourceId, mapping, page });
      if (action === "pulled") summary.pulledFromNotion += 1;
      else if (action === "pushed") summary.pushedToNotion += 1;
      else summary.unchanged += 1;
    } catch (error) {
      summary.failed += 1;
      await markPageError(input.bindings, page.id, error);
    }
  }

  for (const id of await changedIds(input.database)) {
    try {
      const mapping = await loadMappingByShop(input.database, id);
      if (!mapping) continue;
      const action = await syncMapped({
        database: input.database,
        bindings: input.bindings,
        dataSourceId,
        mapping,
        forcePush: true,
      });
      if (action === "pushed") summary.pushedToNotion += 1;
      else if (action === "pulled") summary.pulledFromNotion += 1;
      else summary.unchanged += 1;
    } catch (error) {
      summary.failed += 1;
      console.error(JSON.stringify({
        event: "notion_eshop_changed_push",
        eshopId: id,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  return summary;
}
