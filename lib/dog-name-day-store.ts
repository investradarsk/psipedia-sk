import { env } from "cloudflare:workers";
import type { DogNameDayImportPlan } from "@/lib/dog-name-day-import";
import {
  dogNameDayDateParts,
  isValidDogNameDayDate,
  normalizeDogNameDayName,
  resolveDogNameDay,
  type DogNameDayRecord,
  type DogNameDayStatus,
} from "@/lib/dog-name-days";

type RuntimeBindings = { DB?: D1Database };

type DogNameDayRow = {
  id: number;
  month: number;
  day: number;
  name: string;
  normalized_name: string;
  status: string;
  source: string;
  note: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  created_by: string;
  updated_by: string;
};

export type DogNameDayInput = {
  month?: number;
  day?: number;
  name?: string;
  status?: string;
  source?: string;
  note?: string | null;
};

export type DogNameDayFilters = {
  query?: string;
  month?: number | null;
  status?: DogNameDayStatus | "all";
};

function getD1Binding() {
  const database = (env as unknown as RuntimeBindings).DB;
  return database && typeof database.prepare === "function" ? database : null;
}

function requireD1Binding() {
  const database = getD1Binding();
  if (!database) throw new Error("Databáza kalendára psích mien zatiaľ nie je pripojená.");
  return database;
}

function rowToRecord(row: DogNameDayRow): DogNameDayRecord {
  return {
    id: row.id,
    month: row.month,
    day: row.day,
    name: row.name,
    normalizedName: row.normalized_name,
    status: row.status === "published" ? "published" : row.status === "archived" ? "archived" : "draft",
    source: row.source,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

function normalizeInput(payload: DogNameDayInput) {
  const month = Number(payload.month);
  const day = Number(payload.day);
  const name = payload.name?.trim().replace(/\s+/g, " ") ?? "";
  const normalizedName = normalizeDogNameDayName(name);
  const status: DogNameDayStatus = payload.status === "published" ? "published" : payload.status === "archived" ? "archived" : "draft";
  const source = payload.source?.trim() ?? "";
  const note = payload.note?.trim() || null;

  if (!isValidDogNameDayDate(month, day)) throw new Error("Vyber platný deň a mesiac.");
  if (!name || name.length > 120) throw new Error("Meno musí mať 1 až 120 znakov.");
  if (!normalizedName) throw new Error("Meno sa nepodarilo normalizovať.");
  if (!source || source.length > 1000) throw new Error("Doplň zdroj alebo provenienciu do 1000 znakov.");
  if (note && note.length > 2000) throw new Error("Poznámka môže mať najviac 2000 znakov.");

  return { month, day, name, normalizedName, status, source, note };
}

function isMissingTableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /no such table:\s*dog_name_days/i.test(message);
}

export async function getPublishedDogNameDaysForDate(date: Date = new Date()) {
  const database = getD1Binding();
  const parts = dogNameDayDateParts(date);
  if (!database || !parts) return [] as string[];
  try {
    const result = await database.prepare(`
      SELECT id, month, day, name, normalized_name, status, source, note,
        created_at, updated_at, published_at, created_by, updated_by
      FROM dog_name_days
      WHERE status = 'published' AND month = ? AND day = ?
      ORDER BY normalized_name ASC, id ASC
    `).bind(parts.month, parts.day).all<DogNameDayRow>();
    return resolveDogNameDay(date, result.results.map(rowToRecord));
  } catch (error) {
    if (!isMissingTableError(error)) {
      console.error(JSON.stringify({ event: "dog_name_day_public_lookup_failed", error: error instanceof Error ? error.message : String(error) }));
    }
    return [] as string[];
  }
}

export async function listDogNameDayRecords(filters: DogNameDayFilters = {}) {
  const result = await requireD1Binding().prepare(`
    SELECT id, month, day, name, normalized_name, status, source, note,
      created_at, updated_at, published_at, created_by, updated_by
    FROM dog_name_days
    ORDER BY month ASC, day ASC, normalized_name ASC, id ASC
  `).all<DogNameDayRow>();
  const query = normalizeDogNameDayName(filters.query ?? "");
  return result.results.map(rowToRecord).filter((record) => {
    return (!query || record.normalizedName.includes(query) || normalizeDogNameDayName(record.source).includes(query))
      && (!filters.month || record.month === filters.month)
      && (!filters.status || filters.status === "all" || record.status === filters.status);
  });
}

export async function getDogNameDayRecord(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const row = await requireD1Binding().prepare(`
    SELECT id, month, day, name, normalized_name, status, source, note,
      created_at, updated_at, published_at, created_by, updated_by
    FROM dog_name_days WHERE id = ? LIMIT 1
  `).bind(id).first<DogNameDayRow>();
  return row ? rowToRecord(row) : null;
}

export async function createDogNameDayRecord(payload: DogNameDayInput, editorEmail: string) {
  const database = requireD1Binding();
  const input = normalizeInput(payload);
  const now = new Date().toISOString();
  const row = await database.prepare(`
    INSERT INTO dog_name_days (
      month, day, name, normalized_name, status, source, note,
      created_at, updated_at, published_at, created_by, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `).bind(
    input.month, input.day, input.name, input.normalizedName, input.status, input.source, input.note,
    now, now, input.status === "published" ? now : null, editorEmail, editorEmail,
  ).first<DogNameDayRow>();
  if (!row) throw new Error("Záznam psích menín sa nepodarilo vytvoriť.");
  return rowToRecord(row);
}

export async function updateDogNameDayRecord(id: number, payload: DogNameDayInput, editorEmail: string, existingRecord?: DogNameDayRecord) {
  const database = requireD1Binding();
  const existing = existingRecord ?? await getDogNameDayRecord(id);
  if (!existing) return null;
  const input = normalizeInput(payload);
  const now = new Date().toISOString();
  const publishedAt = input.status === "published" ? existing.publishedAt ?? now : existing.publishedAt;
  const row = await database.prepare(`
    UPDATE dog_name_days SET
      month = ?, day = ?, name = ?, normalized_name = ?, status = ?, source = ?, note = ?,
      updated_at = ?, published_at = ?, updated_by = ?
    WHERE id = ?
    RETURNING *
  `).bind(
    input.month, input.day, input.name, input.normalizedName, input.status, input.source, input.note,
    now, publishedAt, editorEmail, id,
  ).first<DogNameDayRow>();
  return row ? rowToRecord(row) : null;
}

export async function archiveDogNameDayRecord(id: number, editorEmail: string) {
  const now = new Date().toISOString();
  const row = await requireD1Binding().prepare(`
    UPDATE dog_name_days
    SET status = 'archived', updated_at = ?, updated_by = ?
    WHERE id = ?
    RETURNING *
  `).bind(now, editorEmail, id).first<DogNameDayRow>();
  return row ? rowToRecord(row) : null;
}

export function isDogNameDayConflict(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("dog_name_days.month")
    || message.includes("dog_name_days.day")
    || message.includes("dog_name_days.normalized_name")
    || message.includes("dog_name_days_month_day_name_unique");
}

export async function applyDogNameDayImportPlan(plan: DogNameDayImportPlan, editorEmail: string) {
  if (plan.summary.ERROR > 0) throw new Error("Import s chybami nie je možné aplikovať.");
  const database = requireD1Binding();
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  for (const action of plan.actions) {
    if (!action.record || action.action === "SKIP") continue;
    if (action.action === "INSERT") {
      statements.push(database.prepare(`
        INSERT INTO dog_name_days (
          month, day, name, normalized_name, status, source, note,
          created_at, updated_at, published_at, created_by, updated_by
        ) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, NULL, ?, ?)
      `).bind(
        action.record.month, action.record.day, action.record.name, action.record.normalizedName,
        action.record.source, action.record.note, now, now, editorEmail, editorEmail,
      ));
      continue;
    }
    if (action.action === "UPDATE" && action.existingId) {
      statements.push(database.prepare(`
        UPDATE dog_name_days SET
          name = ?, normalized_name = ?, source = ?, note = ?, updated_at = ?, updated_by = ?
        WHERE id = ? AND status = 'draft'
      `).bind(
        action.record.name, action.record.normalizedName, action.record.source, action.record.note,
        now, editorEmail, action.existingId,
      ));
    }
  }
  if (statements.length) await database.batch(statements);
  return {
    inserted: plan.summary.INSERT,
    updated: plan.summary.UPDATE,
    skipped: plan.summary.SKIP,
    errors: 0,
  };
}
