import { buildHelpAdminWhere, helpAdminDomainSql, parseHelpAdminFilters, type HelpAdminFilters } from "./help-admin-query";

export const HELP_BULK_LIMIT = 500;
export type HelpBulkStatus = "draft" | "published";
export type HelpBulkSnapshot = { id: number; status: HelpBulkStatus; updatedAt: string };
export type HelpBulkSelection =
  | { mode: "ids"; ids: number[] }
  | { mode: "filter"; filters: Pick<HelpAdminFilters, "category" | "status" | "urgent" | "state" | "organization" | "location" | "q">; expectedCount: number };

type BulkRow = HelpBulkSnapshot & { category: string; verified: number; actionUrl: string | null; goalAmount: number | null };
type Statement = { bind(...values: (string | number)[]): Statement; all<T>(): Promise<{ results: T[] }> };
export type HelpBulkDatabase = { prepare(sql: string): Statement };

function targetStatus(value: unknown): HelpBulkStatus {
  if (value !== "draft" && value !== "published") throw new Error("Neplatný cieľový stav.");
  return value;
}

function normalizedFilters(value: unknown): HelpAdminFilters {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return parseHelpAdminFilters({
    get(name) {
      const current = source[name];
      if (name === "page") return "1";
      return typeof current === "string" ? current : null;
    },
  });
}

function validIds(value: unknown) {
  if (!Array.isArray(value) || !value.length || value.length > HELP_BULK_LIMIT) throw new Error(`Vyber 1 až ${HELP_BULK_LIMIT} záznamov.`);
  const ids = value.map(Number);
  const unique = new Set(ids);
  if (unique.size !== ids.length || ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) throw new Error("Výber záznamov je neplatný.");
  return ids;
}

function publishable(row: BulkRow) {
  return row.category !== "zbierky" || (
    Boolean(row.verified)
    && Boolean(row.actionUrl?.trim())
    && (row.goalAmount === null || (typeof row.goalAmount === "number" && row.goalAmount > 0))
  );
}

export async function resolveHelpBulkSelection(database: HelpBulkDatabase, value: unknown) {
  const input = value as { targetStatus?: unknown; selection?: HelpBulkSelection } | null;
  const status = targetStatus(input?.targetStatus);
  const selection = input?.selection;
  if (!selection || (selection.mode !== "ids" && selection.mode !== "filter")) throw new Error("Chýba platný výber záznamov.");

  let rows: BulkRow[];
  if (selection.mode === "ids") {
    const ids = validIds(selection.ids);
    const result = await database.prepare(`SELECT id, status, updated_at AS updatedAt, category, verified, action_url AS actionUrl, goal_amount AS goalAmount
      FROM help_cases WHERE ${helpAdminDomainSql()} AND id IN (SELECT CAST(value AS INTEGER) FROM json_each(?)) ORDER BY id`).bind(JSON.stringify(ids)).all<BulkRow>();
    rows = result.results;
    if (rows.length !== ids.length) throw new Error("Niektorý označený záznam už neexistuje. Obnov zoznam.");
  } else {
    if (!Number.isSafeInteger(selection.expectedCount) || selection.expectedCount < 1) throw new Error("Počet vyfiltrovaných záznamov nie je platný.");
    if (selection.expectedCount > HELP_BULK_LIMIT) throw new Error(`Naraz možno hromadne zmeniť najviac ${HELP_BULK_LIMIT} záznamov. Spresni filter.`);
    const filters = normalizedFilters(selection.filters);
    const { where, args } = buildHelpAdminWhere(filters);
    const result = await database.prepare(`SELECT id, status, updated_at AS updatedAt, category, verified, action_url AS actionUrl, goal_amount AS goalAmount
      FROM help_cases${where} ORDER BY updated_at DESC, id DESC LIMIT ?`).bind(...args, HELP_BULK_LIMIT + 1).all<BulkRow>();
    rows = result.results;
    if (rows.length !== selection.expectedCount) throw new Error("Výsledky filtra sa medzičasom zmenili. Obnov zoznam a potvrď nový počet.");
  }

  const candidates = rows.filter((row) => row.status !== status);
  if (candidates.some((row) => row.status !== "draft" && row.status !== "published")) throw new Error("Výber obsahuje neplatný publikačný stav.");
  if (status === "published" && candidates.some((row) => !publishable(row))) {
    throw new Error("Niektorá zbierka nespĺňa podmienky publikovania: musí byť overená, mať platný odkaz a zadaná cieľová suma musí byť kladná.");
  }
  return {
    selectedCount: rows.length,
    changeCount: candidates.length,
    items: candidates.map(({ id, status: currentStatus, updatedAt }) => ({ id, status: currentStatus, updatedAt })) as HelpBulkSnapshot[],
    targetStatus: status,
  };
}

export function validateHelpBulkApply(value: unknown) {
  const input = value as { targetStatus?: unknown; confirmedCount?: unknown; items?: HelpBulkSnapshot[] } | null;
  const status = targetStatus(input?.targetStatus);
  if (!Array.isArray(input?.items) || !input.items.length || input.items.length > HELP_BULK_LIMIT || input.confirmedCount !== input.items.length) {
    throw new Error(`Potvrď platný výber 1 až ${HELP_BULK_LIMIT} záznamov.`);
  }
  const seen = new Set<number>();
  for (const item of input.items) {
    if (!item || !Number.isSafeInteger(item.id) || item.id <= 0 || seen.has(item.id) || (item.status !== "draft" && item.status !== "published") || item.status === status || typeof item.updatedAt !== "string" || !item.updatedAt.trim()) {
      throw new Error("Potvrdený výber je neplatný. Obnov zoznam.");
    }
    seen.add(item.id);
  }
  return { status, items: input.items.map(({ id, status: currentStatus, updatedAt }) => ({ id, status: currentStatus, updatedAt })) };
}

// Atomic compare-and-set: all reviewed rows must still exist with the reviewed status/version.
// Publishing also re-checks the existing collection-specific lifecycle rule.
export const bulkHelpStatusSql = `
  WITH requested AS (
    SELECT json_extract(value, '$.id') AS id,
           json_extract(value, '$.status') AS status,
           json_extract(value, '$.updatedAt') AS updated_at
    FROM json_each(?)
  )
  UPDATE help_cases SET status = ?, updated_at = ?, updated_by = ?,
    published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, ?) ELSE published_at END
  WHERE id IN (SELECT id FROM requested)
    AND ${helpAdminDomainSql()}
    AND (SELECT COUNT(*) FROM help_cases h JOIN requested r ON h.id = r.id
         AND h.status = r.status AND h.updated_at = r.updated_at
         WHERE ${helpAdminDomainSql("h.category")}
           AND (? <> 'published' OR h.category <> 'zbierky'
           OR (h.verified = 1 AND h.action_url IS NOT NULL AND trim(h.action_url) <> '' AND (h.goal_amount IS NULL OR h.goal_amount > 0)))) = ?
  RETURNING id
`;
