import { env } from "cloudflare:workers";
import { slugifyArticleTitle } from "@/lib/article-store";
import { slovakRegions, type SlovakRegion } from "@/lib/events";
import {
  defaultHelpActionLabel,
  allHelpCategories,
  isHelpCategory,
  type HelpCase,
  type HelpCaseStatus,
  type HelpCategorySlug,
} from "@/lib/help";

export type ManagedHelpCaseInput = {
  slug?: string;
  title?: string;
  category?: string;
  status?: string;
  excerpt?: string;
  description?: string;
  organization?: string;
  dogName?: string;
  breed?: string;
  ageNote?: string;
  city?: string;
  region?: string;
  locationNote?: string;
  reportedDate?: string | null;
  deadlineDate?: string | null;
  actionLabel?: string;
  actionUrl?: string | null;
  contactNote?: string;
  goalAmount?: number | string | null;
  raisedAmount?: number | string | null;
  imageUrl?: string | null;
  imageKey?: string | null;
  verified?: boolean;
  urgent?: boolean;
  resolved?: boolean;
};

type HelpCaseRow = {
  id: number;
  slug: string;
  title: string;
  category: string;
  status: string;
  excerpt: string;
  description: string;
  organization: string;
  dog_name: string;
  breed: string;
  age_note: string;
  city: string;
  region: string;
  location_note: string;
  reported_date: string | null;
  deadline_date: string | null;
  action_label: string;
  action_url: string | null;
  contact_note: string;
  goal_amount: number | null;
  raised_amount: number | null;
  image_url: string | null;
  image_key: string | null;
  verified: number;
  urgent: number;
  resolved: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  created_by: string;
  updated_by: string;
};

type RuntimeBindings = { DB?: D1Database };
let helpSchemaReady: Promise<void> | null = null;

function getD1Binding() {
  const database = (env as unknown as RuntimeBindings).DB;
  return database && typeof database.prepare === "function" ? database : null;
}

function requireD1Binding() {
  const database = getD1Binding();
  if (!database) throw new Error("Databáza pomoci psom zatiaľ nie je pripojená.");
  return database;
}

async function ensureHelpStore(database: D1Database) {
  if (helpSchemaReady) return helpSchemaReady;
  helpSchemaReady = (async () => {
    await database.prepare(`
      CREATE TABLE IF NOT EXISTS help_cases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        excerpt TEXT NOT NULL,
        description TEXT NOT NULL,
        organization TEXT NOT NULL,
        dog_name TEXT NOT NULL DEFAULT '',
        breed TEXT NOT NULL DEFAULT '',
        age_note TEXT NOT NULL DEFAULT '',
        city TEXT NOT NULL,
        region TEXT NOT NULL,
        location_note TEXT NOT NULL DEFAULT '',
        reported_date TEXT,
        deadline_date TEXT,
        action_label TEXT NOT NULL,
        action_url TEXT,
        contact_note TEXT NOT NULL DEFAULT '',
        goal_amount INTEGER,
        raised_amount INTEGER,
        image_url TEXT,
        image_key TEXT,
        verified INTEGER NOT NULL DEFAULT 0,
        urgent INTEGER NOT NULL DEFAULT 0,
        resolved INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        published_at TEXT,
        created_by TEXT NOT NULL,
        updated_by TEXT NOT NULL
      )
    `).run();
    await database.batch([
      database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS help_cases_category_slug_unique ON help_cases (category, slug)"),
      database.prepare("CREATE INDEX IF NOT EXISTS help_cases_public_idx ON help_cases (status, category, resolved, urgent, updated_at)"),
      database.prepare("CREATE INDEX IF NOT EXISTS help_cases_region_idx ON help_cases (region, category, status)"),
    ]);
  })().catch((error) => {
    helpSchemaReady = null;
    throw error;
  });
  return helpSchemaReady;
}

function rowToHelpCase(row: HelpCaseRow): HelpCase {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    category: isHelpCategory(row.category) ? row.category : "urgentne-pripady",
    status: row.status === "published" ? "published" : "draft",
    excerpt: row.excerpt,
    description: row.description,
    organization: row.organization,
    dogName: row.dog_name,
    breed: row.breed,
    ageNote: row.age_note,
    city: row.city,
    region: (slovakRegions as readonly string[]).includes(row.region) ? row.region as SlovakRegion : "Online",
    locationNote: row.location_note,
    reportedDate: row.reported_date,
    deadlineDate: row.deadline_date,
    actionLabel: row.action_label,
    actionUrl: row.action_url,
    contactNote: row.contact_note,
    goalAmount: row.goal_amount,
    raisedAmount: row.raised_amount,
    imageUrl: row.image_url,
    imageKey: row.image_key,
    verified: Boolean(row.verified),
    urgent: Boolean(row.urgent),
    resolved: Boolean(row.resolved),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

function normalizeUrl(value: string | null | undefined) {
  const clean = value?.trim() || null;
  if (!clean) return null;
  let parsed: URL;
  try { parsed = new URL(clean); } catch { throw new Error("Odkaz na pomoc nie je platný."); }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("Odkaz musí začínať http:// alebo https://.");
  return clean;
}

function normalizeDate(value: string | null | undefined, label: string) {
  const clean = value?.trim() || null;
  if (!clean) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean) || Number.isNaN(new Date(`${clean}T12:00:00Z`).getTime())) throw new Error(`${label} nie je platný.`);
  return clean;
}

function normalizeAmount(value: number | string | null | undefined, label: string) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100000000 || !Number.isInteger(numeric)) throw new Error(`${label} musí byť celé nezáporné číslo.`);
  return numeric;
}

function normalizeInput(payload: ManagedHelpCaseInput) {
  const title = payload.title?.trim() ?? "";
  const slug = slugifyArticleTitle(payload.slug?.trim() || title);
  const category = payload.category && isHelpCategory(payload.category) ? payload.category : null;
  const status: HelpCaseStatus = payload.status === "published" ? "published" : "draft";
  const excerpt = payload.excerpt?.trim() ?? "";
  const description = payload.description?.trim() ?? "";
  const organization = payload.organization?.trim() ?? "";
  const city = payload.city?.trim() ?? "";
  const region = (slovakRegions as readonly string[]).includes(payload.region ?? "") ? payload.region as SlovakRegion : null;
  const actionUrl = normalizeUrl(payload.actionUrl);
  const goalAmount = normalizeAmount(payload.goalAmount, "Cieľ zbierky");
  const raisedAmount = normalizeAmount(payload.raisedAmount, "Doteraz vyzbieraná suma");
  const verified = Boolean(payload.verified);

  if (!title) throw new Error("Doplň názov prípadu alebo výzvy.");
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Adresa prípadu nie je platná.");
  if (!category) throw new Error("Vyber kategóriu pomoci.");
  if (allHelpCategories.some((item) => item.slug === slug)) throw new Error("Túto adresu používa kategória. Uprav adresu prípadu.");
  if (excerpt.length < 20) throw new Error("Krátky popis by mal mať aspoň 20 znakov.");
  if (description.length < 40) throw new Error("Podrobný popis by mal mať aspoň 40 znakov.");
  if (!organization) throw new Error("Doplň zodpovednú organizáciu alebo osobu.");
  if (!city) throw new Error("Doplň mesto alebo uveď Online.");
  if (!region) throw new Error("Vyber kraj.");
  if (category === "zbierky" && status === "published" && (!verified || !actionUrl || !goalAmount)) {
    throw new Error("Zbierku možno publikovať až po overení, s platným odkazom a cieľovou sumou.");
  }
  if (goalAmount !== null && raisedAmount !== null && raisedAmount > goalAmount * 10) throw new Error("Skontroluj vyzbieranú sumu; výrazne presahuje cieľ.");

  const imageUrl = payload.imageUrl?.trim() || null;
  if (imageUrl && !imageUrl.startsWith("/media/") && !imageUrl.startsWith("/images/") && !/^https:\/\//i.test(imageUrl)) throw new Error("Adresa obrázka nie je platná.");

  return {
    slug,
    title,
    category,
    status,
    excerpt,
    description,
    organization,
    dogName: payload.dogName?.trim() ?? "",
    breed: payload.breed?.trim() ?? "",
    ageNote: payload.ageNote?.trim() ?? "",
    city,
    region,
    locationNote: payload.locationNote?.trim() ?? "",
    reportedDate: normalizeDate(payload.reportedDate, "Dátum prípadu"),
    deadlineDate: normalizeDate(payload.deadlineDate, "Termín pomoci"),
    actionLabel: payload.actionLabel?.trim() || defaultHelpActionLabel(category),
    actionUrl,
    contactNote: payload.contactNote?.trim() ?? "",
    goalAmount,
    raisedAmount,
    imageUrl,
    imageKey: payload.imageKey?.trim() || null,
    verified,
    urgent: Boolean(payload.urgent),
    resolved: Boolean(payload.resolved),
  };
}

export async function getPublishedHelpCases(category?: HelpCategorySlug) {
  const database = getD1Binding();
  if (!database) return [] as HelpCase[];
  await ensureHelpStore(database);
  const result = category
    ? await database.prepare("SELECT * FROM help_cases WHERE status = 'published' AND category = ? ORDER BY resolved ASC, urgent DESC, verified DESC, updated_at DESC, id DESC").bind(category).all<HelpCaseRow>()
    : await database.prepare("SELECT * FROM help_cases WHERE status = 'published' ORDER BY resolved ASC, urgent DESC, verified DESC, updated_at DESC, id DESC").all<HelpCaseRow>();
  return result.results.map(rowToHelpCase);
}

export async function getPublishedHelpCase(category: string, slug: string) {
  const database = getD1Binding();
  if (!database || !isHelpCategory(category)) return null;
  await ensureHelpStore(database);
  const row = await database.prepare("SELECT * FROM help_cases WHERE status = 'published' AND category = ? AND slug = ? LIMIT 1").bind(category, slug).first<HelpCaseRow>();
  return row ? rowToHelpCase(row) : null;
}

export async function listManagedHelpCases() {
  const database = requireD1Binding();
  await ensureHelpStore(database);
  const result = await database.prepare("SELECT * FROM help_cases ORDER BY updated_at DESC, id DESC").all<HelpCaseRow>();
  return result.results.map(rowToHelpCase);
}

export async function getManagedHelpCaseById(id: number) {
  const database = requireD1Binding();
  await ensureHelpStore(database);
  const row = await database.prepare("SELECT * FROM help_cases WHERE id = ? LIMIT 1").bind(id).first<HelpCaseRow>();
  return row ? rowToHelpCase(row) : null;
}

export async function createManagedHelpCase(payload: ManagedHelpCaseInput, editorEmail: string) {
  const database = requireD1Binding();
  await ensureHelpStore(database);
  const input = normalizeInput(payload);
  const now = new Date().toISOString();
  const row = await database.prepare(`
    INSERT INTO help_cases (
      slug, title, category, status, excerpt, description, organization, dog_name, breed, age_note,
      city, region, location_note, reported_date, deadline_date, action_label, action_url, contact_note,
      goal_amount, raised_amount, image_url, image_key, verified, urgent, resolved,
      created_at, updated_at, published_at, created_by, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *
  `).bind(
    input.slug, input.title, input.category, input.status, input.excerpt, input.description, input.organization,
    input.dogName, input.breed, input.ageNote, input.city, input.region, input.locationNote,
    input.reportedDate, input.deadlineDate, input.actionLabel, input.actionUrl, input.contactNote,
    input.goalAmount, input.raisedAmount, input.imageUrl, input.imageKey, input.verified ? 1 : 0,
    input.urgent ? 1 : 0, input.resolved ? 1 : 0, now, now,
    input.status === "published" ? now : null, editorEmail, editorEmail,
  ).first<HelpCaseRow>();
  if (!row) throw new Error("Prípad sa nepodarilo vytvoriť.");
  return rowToHelpCase(row);
}

export async function updateManagedHelpCase(id: number, payload: ManagedHelpCaseInput, editorEmail: string) {
  const database = requireD1Binding();
  await ensureHelpStore(database);
  const existing = await database.prepare("SELECT * FROM help_cases WHERE id = ? LIMIT 1").bind(id).first<HelpCaseRow>();
  if (!existing) return null;
  const input = normalizeInput(payload);
  const now = new Date().toISOString();
  const publishedAt = input.status === "published" ? existing.published_at ?? now : existing.published_at;
  const row = await database.prepare(`
    UPDATE help_cases SET
      slug = ?, title = ?, category = ?, status = ?, excerpt = ?, description = ?, organization = ?,
      dog_name = ?, breed = ?, age_note = ?, city = ?, region = ?, location_note = ?, reported_date = ?,
      deadline_date = ?, action_label = ?, action_url = ?, contact_note = ?, goal_amount = ?, raised_amount = ?,
      image_url = ?, image_key = ?, verified = ?, urgent = ?, resolved = ?, updated_at = ?, published_at = ?, updated_by = ?
    WHERE id = ? RETURNING *
  `).bind(
    input.slug, input.title, input.category, input.status, input.excerpt, input.description, input.organization,
    input.dogName, input.breed, input.ageNote, input.city, input.region, input.locationNote,
    input.reportedDate, input.deadlineDate, input.actionLabel, input.actionUrl, input.contactNote,
    input.goalAmount, input.raisedAmount, input.imageUrl, input.imageKey, input.verified ? 1 : 0,
    input.urgent ? 1 : 0, input.resolved ? 1 : 0, now, publishedAt, editorEmail, id,
  ).first<HelpCaseRow>();
  return row ? rowToHelpCase(row) : null;
}

export async function deleteManagedHelpCase(id: number) {
  const database = requireD1Binding();
  await ensureHelpStore(database);
  const row = await database.prepare("DELETE FROM help_cases WHERE id = ? RETURNING *").bind(id).first<HelpCaseRow>();
  return row ? rowToHelpCase(row) : null;
}

export function isHelpCaseConflict(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("UNIQUE constraint failed") || message.includes("help_cases.category, help_cases.slug");
}
