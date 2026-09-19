import { isDirectoryCategory } from "@/lib/directory";
import { normalizeDirectoryRegion } from "@/lib/directory-store";
import { allHelpCategories } from "@/lib/help";
import { slovakRegions } from "@/lib/events";
import { previewHelpItems } from "@/lib/help-import-preview";

export type ImportJsonRecord = Record<string, unknown>;
export type ImportAction = "inserted" | "updated" | "skipped" | "rejected";

export type GeneralImportPayload = {
  articles: ImportJsonRecord[];
  profiles: ImportJsonRecord[];
  events: ImportJsonRecord[];
  helpItems: ImportJsonRecord[];
  inquiries: ImportJsonRecord[];
  legal: ImportJsonRecord | null;
  profileCategory: string;
};

export type ImportDomainPreview = {
  received: number;
  inserted: number;
  updated: number;
  skipped: number;
  rejected: number;
  errors: string[];
};

export type GeneralImportPreview = {
  domains: Record<"articles" | "profiles" | "events" | "help" | "legal", ImportDomainPreview>;
  totals: {
    received: number;
    inserted: number;
    updated: number;
    skipped: number;
    rejected: number;
    errors: number;
  };
};

export type GeneralImportPlan = {
  payload: GeneralImportPayload;
  actions: {
    articles: ImportAction[];
    profiles: ImportAction[];
    events: ImportAction[];
    helpItems: ImportAction[];
    legal: ImportAction[];
  };
  preview: GeneralImportPreview;
};

const MAX_RECORDS_PER_SECTION = 5_000;

function object(value: unknown): ImportJsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Import obsahuje neplatný záznam.");
  }
  return value as ImportJsonRecord;
}

function list(value: unknown): ImportJsonRecord[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_RECORDS_PER_SECTION) {
    throw new Error("Import obsahuje neplatný počet záznamov.");
  }
  return value.map(object);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function required(value: unknown, label: string) {
  const result = text(value);
  if (!result) throw new Error(`Chýba povinné pole: ${label}.`);
  return result;
}

function importedText(row: ImportJsonRecord, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = row[key];
    if (value === undefined || value === null) continue;
    if (typeof value === "string") return value.trim();
    if (typeof value === "number") return String(value);
  }
  return fallback;
}

function unsafeValue(value: unknown, path = "payload"): string | null {
  if (typeof value === "string") {
    const normalized = value.toLocaleLowerCase("en-US");
    if (
      /<\s*script\b/.test(normalized) ||
      /\bon[a-z]+\s*=/.test(normalized) ||
      /javascript\s*:/.test(normalized) ||
      /data\s*:\s*text\/html/.test(normalized)
    ) {
      return path;
    }
    return null;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const match = unsafeValue(value[index], `${path}[${index}]`);
      if (match) return match;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const match = unsafeValue(nested, `${path}.${key}`);
      if (match) return match;
    }
  }
  return null;
}

export function normalizeGeneralImportPayload(value: unknown): GeneralImportPayload {
  const payload = object(value);
  const allowedTopLevel = new Set(["articles", "profiles", "events", "helpItems", "legal", "inquiries", "profileCategory", "confirmed"]);
  const unknownKeys = Object.keys(payload).filter((key) => !allowedTopLevel.has(key));
  if (unknownKeys.length) {
    throw new Error(`Import obsahuje nepodporované top-level polia: ${unknownKeys.join(", ")}.`);
  }

  const unsafePath = unsafeValue(payload);
  if (unsafePath) throw new Error(`Import obsahuje nepovolený spustiteľný alebo HTML obsah v poli ${unsafePath}.`);

  const inquiries = list(payload.inquiries);
  if (inquiries.length) {
    throw new Error("Import dopytov nie je podporovaný, kým nemá canonical idempotentný kľúč. Dopyty sa týmto importom nesmú duplikovať.");
  }

  return {
    articles: list(payload.articles),
    profiles: list(payload.profiles),
    events: list(payload.events),
    helpItems: list(payload.helpItems),
    inquiries,
    legal: payload.legal ? object(payload.legal) : null,
    profileCategory: text(payload.profileCategory),
  };
}

type StatusRow = { slug: string; status: string };
type ProfileRow = { import_key: string | null; category: string; slug: string; status: string };
type LegalRow = { id: number };

function emptyDomain(received: number): ImportDomainPreview {
  return { received, inserted: 0, updated: 0, skipped: 0, rejected: 0, errors: [] };
}

function applyAction(domain: ImportDomainPreview, action: ImportAction, error?: string) {
  domain[action] += 1;
  if (error) domain.errors.push(error);
}

function validateCanonicalSlug(value: unknown, label: string) {
  const slug = required(value, label);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error(`${label} nie je platný canonical slug`);
  return slug;
}

function validateArticle(row: ImportJsonRecord) {
  validateCanonicalSlug(row.slug, "adresa článku");
  required(row.title, "názov článku");
  required(row.createdAt, "dátum vytvorenia");
  required(row.updatedAt, "dátum úpravy");
}

function validateEvent(row: ImportJsonRecord) {
  validateCanonicalSlug(row.slug, "adresa podujatia");
  required(row.title, "názov podujatia");
  required(row.startDate, "dátum podujatia");
  required(row.createdAt, "dátum vytvorenia podujatia");
  required(row.updatedAt, "dátum úpravy podujatia");
}

function validateProfile(row: ImportJsonRecord, selectedProfileCategory: string) {
  const category = importedText(row, ["category", "Kategória"], selectedProfileCategory);
  if (!isDirectoryCategory(category)) throw new Error("profil nemá platnú kategóriu");
  required(row.name ?? row["Názov"] ?? row["Názov klubu"], "názov profilu");
  validateCanonicalSlug(row.slug ?? row["Slug"], "adresa profilu");
  const region = normalizeDirectoryRegion(importedText(row, ["region", "Kraj"]));
  if (!region) throw new Error("profil nemá platný kraj");
  return {
    category,
    slug: validateCanonicalSlug(row.slug ?? row["Slug"], "adresa profilu"),
    importKey: importedText(row, ["importKey", "Import key"]) || null,
  };
}

function duplicateAwareAction(
  key: string,
  seen: Set<string>,
  existingStatus: string | undefined,
  rowLabel: string,
): { action: ImportAction; error?: string } {
  if (seen.has(key)) return { action: "rejected", error: `${rowLabel}: duplicitný importný kľúč vo vstupnom súbore.` };
  seen.add(key);
  if (!existingStatus) return { action: "inserted" };
  if (existingStatus === "published") return { action: "skipped" };
  return { action: "updated" };
}

export async function buildGeneralImportPlan(database: D1Database, rawPayload: unknown): Promise<GeneralImportPlan> {
  const payload = normalizeGeneralImportPayload(rawPayload);

  const [articlesResult, eventsResult, profilesResult, legalResult] = await Promise.all([
    payload.articles.length
      ? database.prepare("SELECT slug,status FROM managed_articles").all<StatusRow>()
      : Promise.resolve({ results: [] as StatusRow[] }),
    payload.events.length
      ? database.prepare("SELECT slug,status FROM managed_events").all<StatusRow>()
      : Promise.resolve({ results: [] as StatusRow[] }),
    payload.profiles.length
      ? database.prepare("SELECT import_key,category,slug,status FROM directory_profiles").all<ProfileRow>()
      : Promise.resolve({ results: [] as ProfileRow[] }),
    payload.legal
      ? database.prepare("SELECT id FROM legal_settings WHERE id=1").all<LegalRow>()
      : Promise.resolve({ results: [] as LegalRow[] }),
  ]);

  const articleStatus = new Map(articlesResult.results.map((row) => [row.slug, row.status]));
  const eventStatus = new Map(eventsResult.results.map((row) => [row.slug, row.status]));
  const profileByImportKey = new Map(
    profilesResult.results.filter((row) => row.import_key).map((row) => [row.import_key as string, row]),
  );
  const profileByCategorySlug = new Map(
    profilesResult.results.map((row) => [`${row.category}\u0000${row.slug}`, row]),
  );

  const domains = {
    articles: emptyDomain(payload.articles.length),
    profiles: emptyDomain(payload.profiles.length),
    events: emptyDomain(payload.events.length),
    help: emptyDomain(payload.helpItems.length),
    legal: emptyDomain(payload.legal ? 1 : 0),
  };

  const actions = {
    articles: [] as ImportAction[],
    profiles: [] as ImportAction[],
    events: [] as ImportAction[],
    helpItems: [] as ImportAction[],
    legal: [] as ImportAction[],
  };

  const articleKeys = new Set<string>();
  payload.articles.forEach((row, index) => {
    try {
      validateArticle(row);
      const slug = text(row.slug);
      const result = duplicateAwareAction(slug, articleKeys, articleStatus.get(slug), `Článok riadok ${index + 1}`);
      actions.articles.push(result.action);
      applyAction(domains.articles, result.action, result.error);
    } catch (error) {
      actions.articles.push("rejected");
      applyAction(domains.articles, "rejected", `Článok riadok ${index + 1}: ${error instanceof Error ? error.message : "neplatný záznam"}`);
    }
  });

  const eventKeys = new Set<string>();
  payload.events.forEach((row, index) => {
    try {
      validateEvent(row);
      const slug = text(row.slug);
      const result = duplicateAwareAction(slug, eventKeys, eventStatus.get(slug), `Podujatie riadok ${index + 1}`);
      actions.events.push(result.action);
      applyAction(domains.events, result.action, result.error);
    } catch (error) {
      actions.events.push("rejected");
      applyAction(domains.events, "rejected", `Podujatie riadok ${index + 1}: ${error instanceof Error ? error.message : "neplatný záznam"}`);
    }
  });

  const profileKeys = new Set<string>();
  payload.profiles.forEach((row, index) => {
    try {
      const identity = validateProfile(row, payload.profileCategory);
      const slugKey = `${identity.category}\u0000${identity.slug}`;
      const key = identity.importKey ? `import:${identity.importKey}` : `slug:${slugKey}`;
      const existingBySlug = profileByCategorySlug.get(slugKey);
      const existingByImportKey = identity.importKey ? profileByImportKey.get(identity.importKey) : undefined;
      if (identity.importKey && existingBySlug && existingByImportKey !== existingBySlug) {
        throw new Error("importKey nesedí s existujúcim category+slug; záznam sa nesmie prepísať nejednoznačne");
      }
      const existingStatus = identity.importKey ? existingByImportKey?.status : existingBySlug?.status;
      const result = duplicateAwareAction(key, profileKeys, existingStatus, `Profil riadok ${index + 1}`);
      actions.profiles.push(result.action);
      applyAction(domains.profiles, result.action, result.error);
    } catch (error) {
      actions.profiles.push("rejected");
      applyAction(domains.profiles, "rejected", `Profil riadok ${index + 1}: ${error instanceof Error ? error.message : "neplatný záznam"}`);
    }
  });

  if (payload.helpItems.length) {
    const helpPreview = await previewHelpItems(
      database,
      payload.helpItems,
      allHelpCategories.map((item) => item.slug),
      slovakRegions,
    );
    for (const row of helpPreview.rows) {
      if (row.status === "NEW" && row.safeForImport) {
        actions.helpItems.push("inserted");
        applyAction(domains.help, "inserted");
      } else if (row.status === "EXISTING_SAME") {
        actions.helpItems.push("skipped");
        applyAction(domains.help, "skipped");
      } else {
        actions.helpItems.push("rejected");
        applyAction(domains.help, "rejected", `Pomoc riadok ${row.index}: ${row.reason}`);
      }
    }
  }

  if (payload.legal) {
    const action: ImportAction = legalResult.results.length ? "updated" : "inserted";
    actions.legal.push(action);
    applyAction(domains.legal, action);
  }

  const domainValues = Object.values(domains);
  const preview: GeneralImportPreview = {
    domains,
    totals: {
      received: domainValues.reduce((sum, domain) => sum + domain.received, 0),
      inserted: domainValues.reduce((sum, domain) => sum + domain.inserted, 0),
      updated: domainValues.reduce((sum, domain) => sum + domain.updated, 0),
      skipped: domainValues.reduce((sum, domain) => sum + domain.skipped, 0),
      rejected: domainValues.reduce((sum, domain) => sum + domain.rejected, 0),
      errors: domainValues.reduce((sum, domain) => sum + domain.errors.length, 0),
    },
  };

  return { payload, actions, preview };
}
