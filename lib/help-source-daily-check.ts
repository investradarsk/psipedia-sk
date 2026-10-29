import { safeRemoteImageUrl } from "./notion-sync-shared";

export type HelpSourceEntityType = "ADOPTION" | "LOST_FOUND";
export type HelpSourceState = "UNCHECKED" | "ACTIVE_SIGNAL" | "POSSIBLE_CHANGE" | "UNCERTAIN" | "UNAVAILABLE" | "NO_SOURCE";

type SourceRow = {
  entity_type: HelpSourceEntityType;
  entity_id: number;
  title: string;
  report_type: string;
  source_url: string | null;
};
type SourceOutcome = { state: HelpSourceState; httpStatus: number | null; evidence: string; errorCode: string | null };
export type HelpSourceCheckRow = {
  entity_type: HelpSourceEntityType;
  entity_id: number;
  title: string;
  source_url: string;
  source_state: HelpSourceState;
  last_checked_at: string | null;
  last_success_at: string | null;
  last_http_status: number | null;
  evidence: string;
  last_reviewed_at: string | null;
  review_due: number;
};
export type HelpSourceSweepResult = {
  enabled: boolean;
  selected: number;
  checked: number;
  activeSignals: number;
  manualReview: number;
  unavailable: number;
  failed: number;
};

const DAY_MS = 86_400_000;
const MAX_HTML_BYTES = 384 * 1024;
const BATCH_LIMIT = 18;
const FETCH_TIMEOUT_MS = 8000;

export async function helpSourceSchemaReady(db: D1Database) {
  const result = await db.prepare("SELECT 1 AS ready FROM sqlite_master WHERE type='table' AND name='help_source_checks' LIMIT 1")
    .first<{ ready: number }>();
  return Boolean(result?.ready);
}

function normalizeText(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function visibleText(html: string) {
  return normalizeText(html
    .replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:nbsp|amp|quot|lt|gt|#39);/gi, " ")
    .slice(0, MAX_HTML_BYTES));
}

/**
 * A live URL is not proof that a dog is still available.
 * Signals are deliberately conservative and are NEVER written to canonical
 * adoption/lost-found lifecycle fields by an automated check.
 */
export function inspectHelpSourceHtml(html: string, name: string, type: HelpSourceEntityType, reportType = ""): SourceOutcome {
  const text = visibleText(html);
  const identity = normalizeText(name);
  if (identity.length < 3) return { state: "UNCERTAIN", httpStatus: 200, evidence: "Nedá sa spoľahlivo porovnať meno psa.", errorCode: null };
  const position = text.indexOf(identity);
  if (position < 0) return { state: "UNCERTAIN", httpStatus: 200, evidence: "Stránka funguje, ale psa sa nepodarilo jednoznačne identifikovať.", errorCode: null };
  const vicinity = text.slice(Math.max(0, position - 80), Math.min(text.length, position + identity.length + 240));
  const closed = type === "ADOPTION"
    ? /\b(adoptovan|adoptovana|adoptovany|uz ma domov|nasiel domov|nasla domov|ponuka ukoncena|uz nie je k adopcii)\b/
    : /\b(nasiel sa|nasla sa|pes je doma|vrateny majitelovi|majitel najdeny|patranie ukoncene|pripad uzavrety)\b/;
  if (closed.test(vicinity)) return {
    state: "POSSIBLE_CHANGE", httpStatus: 200,
    evidence: "Zdroj obsahuje signál, že prípad mohol byť ukončený. Vyžaduje potvrdenie.",
    errorCode: null,
  };
  const active = type === "ADOPTION"
    ? /\b(hlada domov|k adopcii|na adopciu|na osvojenie|aktualne na adopciu|volny na adopciu)\b/
    : reportType === "FOUND"
      ? /\b(najdeny pes|nasiel sa pes|hlada sa majitel|hladame majitela)\b/
      : /\b(strateny pes|stratil sa|stale sa hlada|patranie pokracuje)\b/;
  if (active.test(vicinity)) return {
    state: "ACTIVE_SIGNAL", httpStatus: 200,
    evidence: "Zdroj obsahuje zhodu mena aj signál aktívnej ponuky alebo pátrania.",
    errorCode: null,
  };
  return { state: "UNCERTAIN", httpStatus: 200, evidence: "Stránka funguje, ale aktuálnosť prípadu nie je potvrdená.", errorCode: null };
}

async function readLimitedHtml(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("NO_BODY");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      if (!next.value) continue;
      size += next.value.byteLength;
      if (size > MAX_HTML_BYTES) throw new Error("BODY_TOO_LARGE");
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let position = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, position);
    position += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function inspectSource(row: SourceRow): Promise<SourceOutcome> {
  if (!row.source_url?.trim()) return {
    state: "NO_SOURCE", httpStatus: null, evidence: "Nie je vyplnený zdrojový odkaz.", errorCode: "MISSING_URL",
  };
  try {
    let target = safeRemoteImageUrl(row.source_url.trim());
    for (let hop = 0; hop < 3; hop++) {
      const response = await fetch(target.toString(), {
        redirect: "manual",
        headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "PsipediaSourceCheck/1.0 (+https://psipedia.sk/kontakt)" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) return { state: "UNAVAILABLE", httpStatus: response.status, evidence: "Zdroj presmeroval bez platného cieľa.", errorCode: "BAD_REDIRECT" };
        target = safeRemoteImageUrl(new URL(location, target).toString());
        continue;
      }
      if (!response.ok) return {
        state: "UNAVAILABLE", httpStatus: response.status,
        evidence: "Zdroj vrátil HTTP " + response.status + ". Je potrebná ručná kontrola.",
        errorCode: "HTTP_ERROR",
      };
      const contentType = response.headers.get("content-type")?.toLowerCase() || "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) return {
        state: "UNCERTAIN", httpStatus: response.status,
        evidence: "Zdroj nevrátil HTML stránku vhodnú na overenie aktuálnosti.", errorCode: "NON_HTML",
      };
      const content = await readLimitedHtml(response);
      return { ...inspectHelpSourceHtml(content, row.title, row.entity_type, row.report_type), httpStatus: response.status };
    }
    return { state: "UNAVAILABLE", httpStatus: null, evidence: "Príliš veľa presmerovaní.", errorCode: "REDIRECT_LIMIT" };
  } catch {
    // Never log credentials, URL query strings, third-party HTML, or personal contact data.
    return { state: "UNAVAILABLE", httpStatus: null, evidence: "Automatické načítanie zlyhalo. Skontroluj zdroj ručne.", errorCode: "FETCH_FAILED" };
  }
}

async function dueSourceRows(db: D1Database, now: Date) {
  const cutoff = new Date(now.getTime() - DAY_MS).toISOString();
  const query = [
    "SELECT p.entity_type,p.entity_id,p.title,p.report_type,p.source_url",
    "FROM (",
    "  SELECT 'ADOPTION' AS entity_type,id AS entity_id,name AS title,'' AS report_type,external_source_url AS source_url",
    "    FROM adoption_dogs WHERE status IN ('ACTIVE','RESERVED')",
    "  UNION ALL",
    "  SELECT 'LOST_FOUND',id,COALESCE(NULLIF(trim(dog_name),''),NULLIF(trim(breed),''),'Pes'),type,source_url",
    "    FROM lost_found_dog_reports WHERE status='ACTIVE' AND published_at IS NOT NULL",
    "    AND (expires_at IS NULL OR expires_at > ?)",
    ") p LEFT JOIN help_source_checks c ON c.entity_type=p.entity_type AND c.entity_id=p.entity_id",
    "WHERE c.last_checked_at IS NULL OR c.last_checked_at <= ? OR c.source_url <> COALESCE(p.source_url,'')",
    "ORDER BY COALESCE(c.last_checked_at,'') ASC,p.entity_type,p.entity_id LIMIT ?",
  ].join("\n");
  const result = await db.prepare(query).bind(now.toISOString(), cutoff, BATCH_LIMIT).all<SourceRow>();
  return result.results ?? [];
}

async function persistOutcome(db: D1Database, row: SourceRow, outcome: SourceOutcome, now: Date) {
  const date = now.toISOString();
  const statement = [
    "INSERT INTO help_source_checks",
    "(entity_type,entity_id,source_url,source_state,last_checked_at,state_changed_at,last_success_at,last_http_status,evidence,error_code,created_at,updated_at)",
    "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
    "ON CONFLICT(entity_type,entity_id) DO UPDATE SET",
    "state_changed_at=CASE WHEN help_source_checks.source_state=excluded.source_state AND",
    "help_source_checks.source_url=excluded.source_url THEN COALESCE(help_source_checks.state_changed_at,excluded.state_changed_at)",
    "ELSE excluded.state_changed_at END,",
    "source_url=excluded.source_url,source_state=excluded.source_state,last_checked_at=excluded.last_checked_at,",
    "last_success_at=CASE WHEN excluded.last_success_at IS NOT NULL THEN excluded.last_success_at ELSE help_source_checks.last_success_at END,",
    "last_http_status=excluded.last_http_status,evidence=excluded.evidence,error_code=excluded.error_code,updated_at=excluded.updated_at,",
    "last_reviewed_at=CASE WHEN help_source_checks.source_state=excluded.source_state",
    "  AND help_source_checks.source_url=excluded.source_url THEN help_source_checks.last_reviewed_at ELSE NULL END,",
    "last_reviewed_state=CASE WHEN help_source_checks.source_state=excluded.source_state",
    "  AND help_source_checks.source_url=excluded.source_url THEN help_source_checks.last_reviewed_state ELSE NULL END",
  ].join(" ");
  await db.prepare(statement).bind(
    row.entity_type, row.entity_id, row.source_url?.trim() || "", outcome.state, date, date,
    outcome.httpStatus === 200 ? date : null, outcome.httpStatus, outcome.evidence,
    outcome.errorCode, date, date,
  ).run();
}

export async function runHelpSourceDailySweep(input: {
  database: D1Database;
  now?: Date;
}): Promise<HelpSourceSweepResult> {
  const result: HelpSourceSweepResult = { enabled: false, selected: 0, checked: 0, activeSignals: 0, manualReview: 0, unavailable: 0, failed: 0 };
  if (!await helpSourceSchemaReady(input.database)) return result;
  result.enabled = true;
  const now = input.now ?? new Date();
  const rows = await dueSourceRows(input.database, now);
  result.selected = rows.length;
  for (let i = 0; i < rows.length; i += 3) {
    const batch = rows.slice(i, i + 3);
    const outcomes = await Promise.all(batch.map(inspectSource));
    for (let index = 0; index < batch.length; index++) {
      const outcome = outcomes[index];
      try {
        await persistOutcome(input.database, batch[index], outcome, now);
        result.checked += 1;
        if (outcome.state === "ACTIVE_SIGNAL") result.activeSignals += 1;
        else result.manualReview += 1;
        if (outcome.state === "UNAVAILABLE") result.unavailable += 1;
      } catch {
        result.failed += 1;
      }
    }
  }
  return result;
}

export async function listHelpSourceChecks(db: D1Database, limit = 60): Promise<HelpSourceCheckRow[]> {
  if (!await helpSourceSchemaReady(db)) return [];
  const query = [
    "SELECT c.entity_type,c.entity_id,",
    "COALESCE(a.name,l.dog_name,l.breed,'Pes') AS title,",
    "c.source_url,c.source_state,c.last_checked_at,c.last_success_at,c.last_http_status,c.evidence,c.last_reviewed_at,
    CASE WHEN c.last_reviewed_at IS NULL OR julianday('now')>=julianday(c.last_reviewed_at)+7 THEN 1 ELSE 0 END AS review_due",
    "FROM help_source_checks c",
    "LEFT JOIN adoption_dogs a ON c.entity_type='ADOPTION' AND a.id=c.entity_id AND a.status IN ('ACTIVE','RESERVED')",
    "LEFT JOIN lost_found_dog_reports l ON c.entity_type='LOST_FOUND' AND l.id=c.entity_id AND l.status='ACTIVE'",
    "WHERE (a.id IS NOT NULL OR l.id IS NOT NULL)",
    "ORDER BY",
    "  CASE WHEN c.source_state='POSSIBLE_CHANGE' THEN 0",
    "       WHEN c.source_state IN ('UNAVAILABLE','NO_SOURCE') THEN 1",
    "       WHEN c.source_state='UNCERTAIN' THEN 2 ELSE 3 END,",
    "  CASE WHEN c.last_reviewed_at IS NULL THEN 0 ELSE 1 END,",
    "  c.last_checked_at DESC LIMIT ?",
  ].join("\n");
  const result = await db.prepare(query).bind(Math.min(150, Math.max(1, limit))).all<HelpSourceCheckRow>();
  return result.results ?? [];
}

export async function confirmHelpSourceManually(db: D1Database, entityType: HelpSourceEntityType, entityId: number, now = new Date()) {
  if (!await helpSourceSchemaReady(db)) return false;
  const timestamp = now.toISOString();
  if (entityType === "ADOPTION") {
    // Explicit editor confirmation, never automatic. This is canonical verification.
    const update = await db.prepare(
      "UPDATE adoption_dogs SET last_verified_at=?,updated_at=? WHERE id=? AND status IN ('ACTIVE','RESERVED')",
    ).bind(timestamp, timestamp, entityId).run();
    if ((update.meta?.changes ?? 0) !== 1) return false;
  } else {
    const existing = await db.prepare("SELECT id FROM lost_found_dog_reports WHERE id=? AND status='ACTIVE'")
      .bind(entityId).first<{ id: number }>();
    if (!existing) return false;
  }
  const saved = await db.prepare(
    "UPDATE help_source_checks SET last_reviewed_at=?,last_reviewed_state=source_state,updated_at=? WHERE entity_type=? AND entity_id=?",
  ).bind(timestamp, timestamp, entityType, entityId).run();
  return (saved.meta?.changes ?? 0) === 1;
}
