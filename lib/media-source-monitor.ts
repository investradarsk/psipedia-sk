import {
  downloadRemoteImage,
  optimizeRemoteImageForStorage,
  safeRemoteImageUrl,
  notionRequest,
  type NotionSyncBindings,
} from "@/lib/notion-sync-shared";

export type MediaSourceEntityType = "DIRECTORY_PROFILE" | "MANAGED_EVENT";
export type MediaSourceStatus = "UNTRACKED" | "OK" | "CANDIDATE" | "CHANGED" | "MISSING" | "ERROR";

export type MediaSourceMonitor = {
  id: number;
  entityType: MediaSourceEntityType;
  entityId: number;
  sourcePageUrl: string | null;
  sourceImageUrl: string | null;
  sourceContentHash: string | null;
  activeImageKey: string | null;
  status: MediaSourceStatus;
  candidateImageUrl: string | null;
  candidateImageKey: string | null;
  candidateContentHash: string | null;
  lastHttpStatus: number | null;
  lastCheckedAt: string | null;
  issueStartedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

type MonitorRow = {
  id: number;
  entity_type: string;
  entity_id: number;
  source_page_url: string | null;
  source_image_url: string | null;
  source_content_hash: string | null;
  active_image_key: string | null;
  status: string;
  candidate_image_url: string | null;
  candidate_image_key: string | null;
  candidate_content_hash: string | null;
  last_http_status: number | null;
  last_checked_at: string | null;
  issue_started_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

type MonitorBindings = NotionSyncBindings;

const SOURCE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MAX_HTML_BYTES = 768 * 1024;
const PAGE_REDIRECTS = 3;

function cleanUrl(value: string | null | undefined) {
  const clean = value?.trim() ?? "";
  if (!clean) return null;
  try {
    const url = safeRemoteImageUrl(clean);
    if (url.hostname === "psipedia.sk" || url.hostname.endsWith(".psipedia.sk")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function rowToMonitor(row: MonitorRow): MediaSourceMonitor {
  const status: MediaSourceStatus = ["UNTRACKED", "OK", "CANDIDATE", "CHANGED", "MISSING", "ERROR"].includes(row.status)
    ? row.status as MediaSourceStatus
    : "ERROR";
  return {
    id: row.id,
    entityType: row.entity_type === "MANAGED_EVENT" ? "MANAGED_EVENT" : "DIRECTORY_PROFILE",
    entityId: Number(row.entity_id),
    sourcePageUrl: row.source_page_url,
    sourceImageUrl: row.source_image_url,
    sourceContentHash: row.source_content_hash,
    activeImageKey: row.active_image_key,
    status,
    candidateImageUrl: row.candidate_image_url,
    candidateImageKey: row.candidate_image_key,
    candidateContentHash: row.candidate_content_hash,
    lastHttpStatus: row.last_http_status,
    lastCheckedAt: row.last_checked_at,
    issueStartedAt: row.issue_started_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function mediaSourceMonitorSchemaReady(database: D1Database) {
  const row = await database.prepare(
    "SELECT 1 ok FROM sqlite_master WHERE type='table' AND name='media_source_monitors' LIMIT 1",
  ).first<{ ok: number }>();
  return Boolean(row?.ok);
}

export async function getMediaSourceMonitorForEntity(
  database: D1Database,
  entityType: MediaSourceEntityType,
  entityId: number,
) {
  if (!await mediaSourceMonitorSchemaReady(database)) return null;
  const row = await database.prepare(
    "SELECT * FROM media_source_monitors WHERE entity_type=? AND entity_id=? LIMIT 1",
  ).bind(entityType, entityId).first<MonitorRow>();
  return row ? rowToMonitor(row) : null;
}

export async function upsertMediaSourceMonitor(input: {
  database: D1Database;
  entityType: MediaSourceEntityType;
  entityId: number;
  sourcePageUrl?: string | null;
  sourceImageUrl?: string | null;
  sourceContentHash?: string | null;
  activeImageKey?: string | null;
  now?: Date;
}) {
  if (!await mediaSourceMonitorSchemaReady(input.database)) return null;
  const now = (input.now ?? new Date()).toISOString();
  const sourcePageUrl = cleanUrl(input.sourcePageUrl);
  const sourceImageUrl = cleanUrl(input.sourceImageUrl);
  await input.database.prepare(`
    INSERT INTO media_source_monitors (
      entity_type, entity_id, source_page_url, source_image_url, source_content_hash,
      active_image_key, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'UNTRACKED', ?, ?)
    ON CONFLICT(entity_type, entity_id) DO UPDATE SET
      source_page_url=COALESCE(excluded.source_page_url, media_source_monitors.source_page_url),
      source_image_url=COALESCE(excluded.source_image_url, media_source_monitors.source_image_url),
      source_content_hash=COALESCE(excluded.source_content_hash, media_source_monitors.source_content_hash),
      active_image_key=COALESCE(excluded.active_image_key, media_source_monitors.active_image_key),
      updated_at=excluded.updated_at
  `).bind(
    input.entityType,
    input.entityId,
    sourcePageUrl,
    sourceImageUrl,
    input.sourceContentHash ?? null,
    input.activeImageKey ?? null,
    now,
    now,
  ).run();
  return getMediaSourceMonitorForEntity(input.database, input.entityType, input.entityId);
}

async function seedMissingMediaMonitors(database: D1Database, now: string) {
  await database.prepare(`
    INSERT OR IGNORE INTO media_source_monitors (
      entity_type, entity_id, source_page_url, source_image_url, active_image_key,
      status, created_at, updated_at
    )
    SELECT
      'DIRECTORY_PROFILE',
      id,
      website_url,
      CASE WHEN image_url LIKE 'https://%' THEN image_url ELSE NULL END,
      image_key,
      'UNTRACKED',
      ?,
      ?
    FROM directory_profiles
    WHERE status <> 'archived'
      AND website_url IS NOT NULL AND trim(website_url) <> ''
  `).bind(now, now).run();

  await database.prepare(`
    INSERT OR IGNORE INTO media_source_monitors (
      entity_type, entity_id, source_page_url, source_image_url, active_image_key,
      status, created_at, updated_at
    )
    SELECT
      'MANAGED_EVENT',
      id,
      website_url,
      CASE WHEN image_url LIKE 'https://%' THEN image_url ELSE NULL END,
      image_key,
      'UNTRACKED',
      ?,
      ?
    FROM managed_events
    WHERE website_url IS NOT NULL AND trim(website_url) <> ''
  `).bind(now, now).run();
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function attribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return decodeHtml(match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim();
}

function absoluteCandidate(raw: string, base: URL) {
  if (!raw || raw.startsWith("data:") || raw.startsWith("blob:")) return null;
  try {
    const value = new URL(raw, base).toString();
    return cleanUrl(value);
  } catch {
    return null;
  }
}

async function fetchHtml(pageUrl: string) {
  let url = safeRemoteImageUrl(pageUrl);
  for (let redirectCount = 0; redirectCount <= PAGE_REDIRECTS; redirectCount += 1) {
    const response = await fetch(url.toString(), {
      redirect: "manual",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "PsipediaMediaMonitor/1.0 (+https://psipedia.sk/kontakt)",
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirectCount >= PAGE_REDIRECTS) throw new Error("Zdrojová stránka má príliš veľa presmerovaní.");
      const location = response.headers.get("location");
      if (!location) throw new Error("Zdrojová stránka presmerovala bez cieľovej adresy.");
      url = safeRemoteImageUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`Zdrojová stránka sa nedá načítať (HTTP ${response.status}).`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Zdrojová stránka nevrátila obsah.");
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value?.byteLength) continue;
        total += value.byteLength;
        if (total > MAX_HTML_BYTES) {
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { html: new TextDecoder().decode(bytes), finalUrl: url };
  }
  throw new Error("Zdrojová stránka sa nedá načítať.");
}

export async function discoverMediaCandidate(pageUrl: string) {
  const page = await fetchHtml(pageUrl);
  const candidates = new Map<string, number>();

  for (const tag of page.html.match(/<meta\b[^>]*>/gi) ?? []) {
    const property = (attribute(tag, "property") || attribute(tag, "name")).toLowerCase();
    if (property !== "og:image" && property !== "twitter:image" && property !== "twitter:image:src") continue;
    const url = absoluteCandidate(attribute(tag, "content"), page.finalUrl);
    if (url) candidates.set(url, Math.max(candidates.get(url) ?? 0, property === "og:image" ? 80 : 70));
  }

  for (const tag of page.html.match(/<img\b[^>]*>/gi) ?? []) {
    const raw = attribute(tag, "src") || attribute(tag, "data-src") || attribute(tag, "data-lazy-src");
    const url = absoluteCandidate(raw, page.finalUrl);
    if (!url) continue;
    const signal = [
      raw,
      attribute(tag, "alt"),
      attribute(tag, "class"),
      attribute(tag, "id"),
    ].join(" ").toLowerCase();
    let score = 30;
    if (/logo|brand|site-logo|header-logo|navbar-logo/.test(signal)) score += 80;
    if (/hero|cover|banner|event/.test(signal)) score += 25;
    if (/avatar|icon|sprite|tracking|pixel/.test(signal)) score -= 40;
    candidates.set(url, Math.max(candidates.get(url) ?? 0, score));
  }

  return [...candidates.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([url]) => url)[0] ?? null;
}

async function deleteCandidate(bucket: R2Bucket | undefined, key: string | null) {
  if (!bucket || !key) return;
  await bucket.delete(key).catch(() => undefined);
}

async function storeCandidate(input: {
  bindings: MonitorBindings;
  entityType: MediaSourceEntityType;
  entityId: number;
  sourceImageUrl: string;
}) {
  const bucket = input.bindings.BUCKET;
  if (!bucket) throw new Error("Cloudflare R2 úložisko nie je pripojené.");
  const remote = await downloadRemoteImage(input.sourceImageUrl);
  const stored = await optimizeRemoteImageForStorage(input.bindings, remote);
  const folder = input.entityType === "MANAGED_EVENT" ? "events" : "directory";
  const key = `candidates/${folder}/${input.entityId}/${remote.contentHash}.${stored.extension}`;
  await bucket.put(key, stored.bytes, {
    httpMetadata: {
      contentType: stored.contentType,
      cacheControl: "private, max-age=0, no-store",
    },
    customMetadata: {
      source: "media-source-monitor",
      sourceImageUrl: input.sourceImageUrl.slice(0, 400),
      sourceContentHash: remote.contentHash,
      optimized: stored.optimized ? "1" : "0",
    },
  });
  return { key, contentHash: remote.contentHash, finalUrl: remote.finalUrl };
}

function httpStatusFromError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/HTTP\s+(\d{3})/i);
  return match ? Number(match[1]) : null;
}

async function setMonitorResult(input: {
  database: D1Database;
  row: MediaSourceMonitor;
  status: MediaSourceStatus;
  now: string;
  sourceImageUrl?: string | null;
  sourceContentHash?: string | null;
  candidateImageUrl?: string | null;
  candidateImageKey?: string | null;
  candidateContentHash?: string | null;
  httpStatus?: number | null;
  error?: string | null;
}) {
  const issueStartedAt = input.status === "OK"
    ? null
    : input.row.issueStartedAt ?? input.now;
  await input.database.prepare(`
    UPDATE media_source_monitors
    SET source_image_url=COALESCE(?, source_image_url),
        source_content_hash=COALESCE(?, source_content_hash),
        status=?,
        candidate_image_url=?,
        candidate_image_key=?,
        candidate_content_hash=?,
        last_http_status=?,
        last_checked_at=?,
        issue_started_at=?,
        last_error=?,
        updated_at=?
    WHERE id=?
  `).bind(
    input.sourceImageUrl ?? null,
    input.sourceContentHash ?? null,
    input.status,
    input.candidateImageUrl ?? null,
    input.candidateImageKey ?? null,
    input.candidateContentHash ?? null,
    input.httpStatus ?? null,
    input.now,
    issueStartedAt,
    input.error?.slice(0, 1000) ?? null,
    input.now,
    input.row.id,
  ).run();
}

async function monitorOne(input: {
  database: D1Database;
  bindings: MonitorBindings;
  row: MediaSourceMonitor;
  now: string;
}) {
  const { row } = input;
  let sourceImageUrl = cleanUrl(row.sourceImageUrl);
  const hadTrackedSource = Boolean(sourceImageUrl);

  if (!sourceImageUrl && row.sourcePageUrl) {
    try {
      sourceImageUrl = await discoverMediaCandidate(row.sourcePageUrl);
    } catch (error) {
      await setMonitorResult({
        database: input.database,
        row,
        status: "ERROR",
        now: input.now,
        error: error instanceof Error ? error.message : String(error),
        httpStatus: httpStatusFromError(error),
      });
      return "error" as const;
    }
  }

  if (!sourceImageUrl) {
    await setMonitorResult({
      database: input.database,
      row,
      status: "MISSING",
      now: input.now,
      error: "Na zdrojovej stránke sa nepodarilo nájsť použiteľný obrázok.",
    });
    return "missing" as const;
  }

  try {
    const remote = await downloadRemoteImage(sourceImageUrl);
    const discoveredWithoutBaseline = !hadTrackedSource && !row.sourceContentHash;
    const needsCandidate = !row.activeImageKey
      || discoveredWithoutBaseline
      || (
        Boolean(row.sourceContentHash)
        && row.sourceContentHash !== remote.contentHash
      );

    if (!needsCandidate) {
      await deleteCandidate(input.bindings.BUCKET, row.candidateImageKey);
      await setMonitorResult({
        database: input.database,
        row,
        status: "OK",
        now: input.now,
        sourceImageUrl,
        sourceContentHash: row.sourceContentHash ?? remote.contentHash,
        httpStatus: 200,
      });
      return "ok" as const;
    }

    const candidate = await storeCandidate({
      bindings: input.bindings,
      entityType: row.entityType,
      entityId: row.entityId,
      sourceImageUrl,
    });
    if (row.candidateImageKey && row.candidateImageKey !== candidate.key) {
      await deleteCandidate(input.bindings.BUCKET, row.candidateImageKey);
    }

    await setMonitorResult({
      database: input.database,
      row,
      status: row.activeImageKey && row.sourceContentHash ? "CHANGED" : "CANDIDATE",
      now: input.now,
      sourceImageUrl: candidate.finalUrl,
      candidateImageUrl: candidate.finalUrl,
      candidateImageKey: candidate.key,
      candidateContentHash: candidate.contentHash,
      httpStatus: 200,
    });
    return row.activeImageKey && row.sourceContentHash ? "changed" as const : "candidate" as const;
  } catch (error) {
    const status = httpStatusFromError(error);
    if (row.sourcePageUrl) {
      try {
        const discovered = await discoverMediaCandidate(row.sourcePageUrl);
        if (discovered && discovered !== sourceImageUrl) {
          const candidate = await storeCandidate({
            bindings: input.bindings,
            entityType: row.entityType,
            entityId: row.entityId,
            sourceImageUrl: discovered,
          });
          if (row.candidateImageKey && row.candidateImageKey !== candidate.key) {
            await deleteCandidate(input.bindings.BUCKET, row.candidateImageKey);
          }
          await setMonitorResult({
            database: input.database,
            row,
            status: row.activeImageKey ? "CHANGED" : "CANDIDATE",
            now: input.now,
            sourceImageUrl: sourceImageUrl,
            candidateImageUrl: candidate.finalUrl,
            candidateImageKey: candidate.key,
            candidateContentHash: candidate.contentHash,
            httpStatus: status,
            error: "Pôvodný obrázok už nie je dostupný; našiel sa nový kandidát na zdrojovej stránke.",
          });
          return row.activeImageKey ? "changed" as const : "candidate" as const;
        }
      } catch {
        // Keep the original source failure below.
      }
    }

    await setMonitorResult({
      database: input.database,
      row,
      status: status === 404 || status === 410 ? "MISSING" : "ERROR",
      now: input.now,
      httpStatus: status,
      error: error instanceof Error ? error.message : String(error),
    });
    return status === 404 || status === 410 ? "missing" as const : "error" as const;
  }
}

export async function runMediaSourceMonitorSweep(input: {
  database: D1Database;
  bindings: MonitorBindings;
  now?: Date;
  limit?: number;
  force?: boolean;
}) {
  if (!await mediaSourceMonitorSchemaReady(input.database)) {
    return { schemaReady: false, seeded: 0, checked: 0, ok: 0, candidate: 0, changed: 0, missing: 0, error: 0 };
  }
  const nowDate = input.now ?? new Date();
  const now = nowDate.toISOString();
  const before = new Date(nowDate.getTime() - SOURCE_CHECK_INTERVAL_MS).toISOString();

  await seedMissingMediaMonitors(input.database, now);

  const dueClause = input.force ? "1=1" : "(last_checked_at IS NULL OR last_checked_at <= ?)";
  const statement = input.database.prepare(`
    SELECT * FROM media_source_monitors
    WHERE ${dueClause}
    ORDER BY CASE status
      WHEN 'CHANGED' THEN 0
      WHEN 'MISSING' THEN 1
      WHEN 'ERROR' THEN 2
      WHEN 'CANDIDATE' THEN 3
      ELSE 4
    END, COALESCE(last_checked_at, '') ASC, id ASC
    LIMIT ?
  `);
  const result = input.force
    ? await statement.bind(Math.max(1, Math.min(100, input.limit ?? 25))).all<MonitorRow>()
    : await statement.bind(before, Math.max(1, Math.min(100, input.limit ?? 25))).all<MonitorRow>();

  const summary = { schemaReady: true, seeded: 0, checked: 0, ok: 0, candidate: 0, changed: 0, missing: 0, error: 0 };
  for (const raw of result.results ?? []) {
    const outcome = await monitorOne({
      database: input.database,
      bindings: input.bindings,
      row: rowToMonitor(raw),
      now,
    });
    summary.checked += 1;
    summary[outcome] += 1;
  }
  return summary;
}

export async function listMediaSourceIssues(database: D1Database, limit = 100, offset = 0) {
  if (!await mediaSourceMonitorSchemaReady(database)) return [];
  const result = await database.prepare(`
    SELECT * FROM media_source_monitors
    WHERE status IN ('CANDIDATE','CHANGED','MISSING','ERROR')
    ORDER BY COALESCE(issue_started_at, updated_at) DESC, id DESC
    LIMIT ? OFFSET ?
  `).bind(
    Math.max(1, Math.min(250, limit)),
    Math.max(0, Math.floor(offset)),
  ).all<MonitorRow>();
  return (result.results ?? []).map(rowToMonitor);
}

async function writeAcceptedSourceBackToNotion(input: {
  database: D1Database;
  bindings: MonitorBindings;
  row: MediaSourceMonitor;
  sourceImageUrl: string;
}) {
  if (!input.bindings.NOTION_API_TOKEN?.trim()) return;
  const mappingTable = input.row.entityType === "MANAGED_EVENT"
    ? "event_notion_sync"
    : "directory_notion_sync";
  const entityColumn = input.row.entityType === "MANAGED_EVENT"
    ? "event_id"
    : "directory_profile_id";
  try {
    const mapping = await input.database.prepare(
      `SELECT notion_page_id FROM ${mappingTable} WHERE ${entityColumn}=? LIMIT 1`,
    ).bind(input.row.entityId).first<{ notion_page_id: string }>();
    if (!mapping?.notion_page_id) return;
    await notionRequest(input.bindings, `/pages/${encodeURIComponent(mapping.notion_page_id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        properties: {
          "Hlavný obrázok URL": { url: input.sourceImageUrl },
        },
      }),
    });
  } catch (error) {
    console.error(JSON.stringify({
      event: "media_source_notion_writeback_failed",
      entityType: input.row.entityType,
      entityId: input.row.entityId,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

export async function acceptMediaSourceCandidate(input: {
  database: D1Database;
  bindings: MonitorBindings;
  monitorId: number;
  actorRef: string;
  now?: Date;
}) {
  if (!await mediaSourceMonitorSchemaReady(input.database)) throw new Error("Monitoring obrázkov zatiaľ nie je nasadený.");
  const raw = await input.database.prepare(
    "SELECT * FROM media_source_monitors WHERE id=? LIMIT 1",
  ).bind(input.monitorId).first<MonitorRow>();
  if (!raw) throw new Error("Kontrola obrázka sa nenašla.");
  const row = rowToMonitor(raw);
  if (!row.candidateImageKey || !row.candidateContentHash || !row.candidateImageUrl) {
    throw new Error("Táto položka nemá pripravený nový obrázok.");
  }
  const bucket = input.bindings.BUCKET;
  if (!bucket) throw new Error("Cloudflare R2 úložisko nie je pripojené.");
  const candidate = await bucket.get(row.candidateImageKey);
  if (!candidate) throw new Error("Pripravený obrázok už v úložisku nie je.");

  const extension = row.candidateImageKey.split(".").pop()?.toLowerCase() || "webp";
  const folder = row.entityType === "MANAGED_EVENT" ? "events" : "directory";
  const key = `${folder}/${new Date().getUTCFullYear()}/source-${row.entityId}-${crypto.randomUUID()}.${extension}`;
  const contentType = candidate.httpMetadata?.contentType || (extension === "webp" ? "image/webp" : "application/octet-stream");
  await bucket.put(key, candidate.body, {
    httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" },
    customMetadata: {
      source: "media-source-monitor-approved",
      sourceImageUrl: row.candidateImageUrl.slice(0, 400),
      sourceContentHash: row.candidateContentHash,
      approvedBy: input.actorRef.slice(0, 200),
    },
  });

  const now = (input.now ?? new Date()).toISOString();
  const imageUrl = `/media/${key}`;
  if (row.entityType === "DIRECTORY_PROFILE") {
    await input.database.prepare(`
      UPDATE directory_profiles
      SET image_url=?, image_key=?, updated_at=?, updated_by=?
      WHERE id=?
    `).bind(imageUrl, key, now, input.actorRef, row.entityId).run();
  } else {
    await input.database.prepare(`
      UPDATE managed_events
      SET image_url=?, image_key=?, updated_at=?, updated_by=?
      WHERE id=?
    `).bind(imageUrl, key, now, input.actorRef, row.entityId).run();
  }

  await input.database.prepare(`
    UPDATE media_source_monitors
    SET source_image_url=?, source_content_hash=?, active_image_key=?,
        status='OK', candidate_image_url=NULL, candidate_image_key=NULL,
        candidate_content_hash=NULL, last_http_status=200, last_checked_at=?,
        issue_started_at=NULL, last_error=NULL, updated_at=?
    WHERE id=?
  `).bind(row.candidateImageUrl, row.candidateContentHash, key, now, now, row.id).run();

  await writeAcceptedSourceBackToNotion({
    database: input.database,
    bindings: input.bindings,
    row,
    sourceImageUrl: row.candidateImageUrl,
  });

  await bucket.delete(row.candidateImageKey).catch(() => undefined);
  if (row.activeImageKey && row.activeImageKey !== key && (row.activeImageKey.startsWith("directory/") || row.activeImageKey.startsWith("events/"))) {
    await bucket.delete(row.activeImageKey).catch(() => undefined);
  }
  return { monitorId: row.id, entityType: row.entityType, entityId: row.entityId, imageUrl, imageKey: key };
}
