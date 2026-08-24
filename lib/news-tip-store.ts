import { env } from "cloudflare:workers";
import {
  isNewsTipStatus,
  isNewsTipTopic,
  type NewsTip,
  type NewsTipStatus,
} from "@/lib/news-tip";

export type NewsTipInput = {
  topic?: string;
  title?: string;
  summary?: string;
  sourceUrl?: string | null;
  location?: string;
  eventDate?: string | null;
  contactName?: string;
  contactEmail?: string | null;
  consent?: boolean;
};

export type NewsTipUpdateInput = {
  status?: string;
  internalNote?: string;
};

type NewsTipRow = {
  id: number;
  topic: string;
  title: string;
  summary: string;
  source_url: string | null;
  location: string;
  event_date: string | null;
  contact_name: string;
  contact_email: string | null;
  status: string;
  internal_note: string;
  consent: number;
  created_at: string;
  updated_at: string;
};

type RuntimeBindings = { DB?: D1Database };

function getD1Binding() {
  const database = (env as unknown as RuntimeBindings).DB;
  return database && typeof database.prepare === "function" ? database : null;
}

function requireD1Binding() {
  const database = getD1Binding();
  if (!database) throw new Error("Databáza redakčných tipov zatiaľ nie je pripojená.");
  return database;
}

async function ensureNewsTipsStore(database: D1Database) {
  void database;
  // Schema creation and indexes are handled by deployment migrations.
}

function rowToNewsTip(row: NewsTipRow): NewsTip {
  return {
    id: row.id,
    topic: isNewsTipTopic(row.topic) ? row.topic : "iny",
    title: row.title,
    summary: row.summary,
    sourceUrl: row.source_url,
    location: row.location,
    eventDate: row.event_date,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    status: isNewsTipStatus(row.status) ? row.status : "new",
    internalNote: row.internal_note,
    consent: Boolean(row.consent),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeUrl(value: string | null | undefined) {
  const clean = value?.trim() || null;
  if (!clean) return null;
  if (clean.length > 2_000) throw new Error("Odkaz je príliš dlhý.");
  let parsed: URL;
  try { parsed = new URL(clean); } catch { throw new Error("Odkaz na zdroj nie je platný."); }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("Odkaz musí začínať http:// alebo https://.");
  return clean;
}

function normalizeEmail(value: string | null | undefined) {
  const clean = value?.trim().toLowerCase() || null;
  if (!clean) return null;
  if (clean.length > 180 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error("Kontaktný e-mail nie je platný.");
  return clean;
}

function normalizeEventDate(value: string | null | undefined) {
  const clean = value?.trim() || null;
  if (!clean) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean) || Number.isNaN(Date.parse(`${clean}T12:00:00Z`))) throw new Error("Dátum udalosti nie je platný.");
  return clean;
}

function normalizeInput(payload: NewsTipInput) {
  const topic = payload.topic && isNewsTipTopic(payload.topic) ? payload.topic : null;
  const title = payload.title?.trim() ?? "";
  const summary = payload.summary?.trim() ?? "";
  const location = payload.location?.trim() ?? "";
  const contactName = payload.contactName?.trim() ?? "";
  if (!topic) throw new Error("Vyber tému tipu.");
  if (title.length < 8 || title.length > 160) throw new Error("Názov tipu musí mať 8 až 160 znakov.");
  if (summary.length < 30 || summary.length > 4_000) throw new Error("Opis musí mať 30 až 4 000 znakov.");
  if (location.length > 140) throw new Error("Miesto je príliš dlhé.");
  if (contactName.length > 100) throw new Error("Kontaktné meno je príliš dlhé.");
  if (!payload.consent) throw new Error("Pred odoslaním potvrď oboznámenie sa so spracúvaním údajov.");
  return {
    topic,
    title,
    summary,
    sourceUrl: normalizeUrl(payload.sourceUrl),
    location,
    eventDate: normalizeEventDate(payload.eventDate),
    contactName,
    contactEmail: normalizeEmail(payload.contactEmail),
  };
}

export class NewsTipRateLimitError extends Error {}

async function purgeExpiredNewsTips(database: D1Database) {
  const completedBefore = new Date(Date.now() - 180 * 24 * 60 * 60 * 1_000).toISOString();
  const absoluteBefore = new Date(Date.now() - 365 * 24 * 60 * 60 * 1_000).toISOString();
  await database.prepare("DELETE FROM news_tips WHERE (status IN ('used', 'dismissed') AND updated_at < ?) OR created_at < ?")
    .bind(completedBefore, absoluteBefore).run();
}

export async function createNewsTip(payload: NewsTipInput) {
  const database = requireD1Binding();
  await ensureNewsTipsStore(database);
  await purgeExpiredNewsTips(database);
  const input = normalizeInput(payload);
  const limitSince = new Date(Date.now() - 20 * 60 * 1_000).toISOString();
  const recent = input.contactEmail
    ? await database.prepare("SELECT COUNT(*) AS count FROM news_tips WHERE contact_email = ? AND created_at >= ?").bind(input.contactEmail, limitSince).first<{ count: number }>()
    : await database.prepare("SELECT COUNT(*) AS count FROM news_tips WHERE title = ? AND created_at >= ?").bind(input.title, limitSince).first<{ count: number }>();
  if ((recent?.count ?? 0) >= 3) throw new NewsTipRateLimitError("Za krátky čas bolo odoslaných priveľa tipov. Skús to neskôr.");

  const now = new Date().toISOString();
  const row = await database.prepare(`
    INSERT INTO news_tips (
      topic, title, summary, source_url, location, event_date, contact_name, contact_email,
      status, internal_note, consent, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', '', 1, ?, ?) RETURNING *
  `).bind(
    input.topic, input.title, input.summary, input.sourceUrl, input.location, input.eventDate,
    input.contactName, input.contactEmail, now, now,
  ).first<NewsTipRow>();
  if (!row) throw new Error("Tip sa nepodarilo uložiť.");
  return rowToNewsTip(row);
}

export async function listNewsTips() {
  const database = requireD1Binding();
  await ensureNewsTipsStore(database);
  const result = await database.prepare(`
    SELECT id, topic, title, summary, source_url, location, event_date, contact_name,
      contact_email, status, internal_note, consent, created_at, updated_at
    FROM news_tips
    ORDER BY CASE status WHEN 'new' THEN 0 WHEN 'reviewing' THEN 1 WHEN 'used' THEN 2 ELSE 3 END, created_at DESC
    LIMIT 200
  `).all<NewsTipRow>();
  return result.results.map(rowToNewsTip);
}

export async function updateNewsTip(id: number, payload: NewsTipUpdateInput) {
  const database = requireD1Binding();
  await ensureNewsTipsStore(database);
  const existing = await database.prepare("SELECT * FROM news_tips WHERE id = ? LIMIT 1").bind(id).first<NewsTipRow>();
  if (!existing) return null;
  const status: NewsTipStatus = payload.status && isNewsTipStatus(payload.status) ? payload.status : rowToNewsTip(existing).status;
  const internalNote = payload.internalNote === undefined ? existing.internal_note : payload.internalNote.trim();
  if (internalNote.length > 2_000) throw new Error("Interná poznámka môže mať najviac 2 000 znakov.");
  const row = await database.prepare("UPDATE news_tips SET status = ?, internal_note = ?, updated_at = ? WHERE id = ? RETURNING *")
    .bind(status, internalNote, new Date().toISOString(), id).first<NewsTipRow>();
  return row ? rowToNewsTip(row) : null;
}

export async function deleteNewsTip(id: number) {
  const database = requireD1Binding();
  await ensureNewsTipsStore(database);
  const row = await database.prepare("DELETE FROM news_tips WHERE id = ? RETURNING *").bind(id).first<NewsTipRow>();
  return row ? rowToNewsTip(row) : null;
}
