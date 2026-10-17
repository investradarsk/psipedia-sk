import { geminiReviewState, type GeminiReviewState } from "./gemini-notion-review-state";
import { acquireGeminiNotionLock } from "./gemini-notion-review-lock";
import { getGeminiCatalogItem } from "@/lib/gemini-automation-catalog";
import type { DirectoryQualityResolutionInput, DirectoryQualityResolutionStatus } from "@/lib/directory-profile-metadata";
import {
  notionRequest, notionRichTextProperty, notionSelectProperty,
  notionTitleProperty, notionUrlProperty, notionPropertyRecord,
  type NotionPage,
} from "@/lib/notion-sync-shared";

export const GEMINI_NOTION_CREATOR = "Gemini automatizácia";

export type GeminiNotionReviewEnv = {
  DB?: D1Database;
  NOTION_API_TOKEN?: string;
  NOTION_DIRECTORY_DATA_SOURCE_ID?: string;
};

export type GeminiDirectoryDraft = {
  canonicalVerified?: boolean;
  reviewState: GeminiReviewState;
  syncError: string;
  rejectionReason: string;
  notes: string;
  geminiNote?: string;
  id: string;
  name: string;
  category: string;
  city: string;
  address: string;
  region: string;
  phone: string;
  email: string;
  website: string;
  logoUrl: string;
  imageUrl: string;
  summary: string;
  description: string;
  services: string;
  source: string;
  editorialState: string;
  psipediaStatus: string;
  psipediaId: string;
  createdAt: string;
  lastEditedAt: string;
  slug: string;
  district: string;
  postalCode: string;
  street: string;
  houseNumber: string;
  addressFormat: string;
  qualifications: string;
  priceNote: string;
  facebook: string;
  instagram: string;
  internalEmail: string;
  imageKey: string;
  verified: boolean;
  featured: boolean;
  qualityResolutions: DirectoryQualityResolutionInput;
  seo: { title: string; description: string; focusKeyword: string; canonicalUrl: string; ogTitle: string; ogDescription: string; ogImage: string; noindex: boolean };
  notionUrl: string;
};

type DirectoryNotionPage = NotionPage & {
  parent?: { type?: string; data_source_id?: string };
  created_time?: string;
  url?: string;
};

type DirectoryQueryResult = {
  results?: DirectoryNotionPage[];
  has_more?: boolean;
  next_cursor?: string | null;
};

export class GeminiNotionReviewError extends Error {
  readonly code: "CATEGORY" | "ID" | "NOT_FOUND" | "STATE" | "CONFIG" | "CONFLICT" | "LOCKED";
  constructor(code: GeminiNotionReviewError["code"]) {
    super(code);
    this.code = code;
  }
}

export function validGeminiDirectoryCategory(stableKey: string) {
  const item = getGeminiCatalogItem(stableKey);
  return item?.section === "directory" ? item : null;
}

export function notionDraftText(page: NotionPage, key: string) {
  const rich = notionRichTextProperty(page, key);
  if (rich) return rich;
  const phone = notionPropertyRecord(page, key)?.phone_number;
  const email = notionPropertyRecord(page, key)?.email;
  if (typeof phone === "string") return phone;
  if (typeof email === "string") return email;
  return notionTitleProperty(page, key) || notionUrlProperty(page, key) || notionSelectProperty(page, key);
}

export function isExternalGeminiDirectoryDraft(page: DirectoryNotionPage, dataSourceId: string) {
  return page.parent?.data_source_id === dataSourceId &&
    notionRichTextProperty(page, "Vytvoril") === GEMINI_NOTION_CREATOR &&
    !!notionTitleProperty(page, "Názov");
}

const notionQualityValues: Record<string, DirectoryQualityResolutionStatus> = {
  "Nemá": "DOES_NOT_EXIST",
  "Verejne nezverejnené": "NOT_PUBLIC",
  "Nedohľadateľné": "NOT_FOUND",
  "Nevzťahuje sa": "NOT_APPLICABLE",
};
const notionQualityFields = {
  phone: "Kvalita · Telefón", email: "Kvalita · E-mail",
  website: "Kvalita · Web", image: "Kvalita · Obrázok", address: "Kvalita · Adresa",
} as const;
function notionPreservedText(page: NotionPage, key: string) {
  const items = notionPropertyRecord(page, key)?.rich_text;
  if (!Array.isArray(items)) return notionDraftText(page, key);
  return items.map((item) => item && typeof item === "object" &&
    typeof (item as { plain_text?: unknown }).plain_text === "string"
    ? (item as { plain_text: string }).plain_text : "").join("");
}
function notionCheckbox(page: NotionPage, key: string) {
  return notionPropertyRecord(page, key)?.checkbox === true;
}
function renderDraft(page: DirectoryNotionPage): GeminiDirectoryDraft {
  const name = notionTitleProperty(page, "Názov");
  const notes = notionPreservedText(page, "Poznámky");
  const audit = reviewAudit(notes);
  const lastRejection = audit.findLast(event => event.action === "REJECT");
  return {
    notes,
    geminiNote: notionPreservedText(page, "Gemini poznámka"),
    syncError: notionDraftText(page, "Sync chyba"),
    rejectionReason: lastRejection?.reason ?? "",
    canonicalVerified: false,
    reviewState: geminiReviewState({
      editorialState: notionSelectProperty(page, "Stav"),
      psipediaStatus: notionSelectProperty(page, "Psipedia stav"),
      psipediaId: notionDraftText(page, "Psipedia ID"), reviewed: audit.length > 0,
    }),
    id: page.id,
    name,
    category: notionDraftText(page, "Kategória"),
    city: notionDraftText(page, "Mesto"),
    address: notionDraftText(page, "Adresa"),
    region: notionDraftText(page, "Kraj"),
    phone: notionDraftText(page, "Telefón"),
    email: notionDraftText(page, "E-mail"),
    website: notionUrlProperty(page, "Web"),
    logoUrl: notionUrlProperty(page, "Logo URL"),
    imageUrl: notionUrlProperty(page, "Hlavný obrázok URL"),
    summary: notionPreservedText(page, "Perex"),
    description: notionPreservedText(page, "Popis"),
    services: notionPreservedText(page, "Služby"),
    source: notionUrlProperty(page, "Zdroj dát"),
    editorialState: notionSelectProperty(page, "Stav"),
    psipediaStatus: notionSelectProperty(page, "Psipedia stav"),
    psipediaId: notionDraftText(page, "Psipedia ID"),
    createdAt: page.created_time ?? "",
    lastEditedAt: page.last_edited_time ?? "",
    slug: notionDraftText(page, "Slug"),
    district: notionDraftText(page, "Okres"),
    postalCode: notionDraftText(page, "PSČ"),
    street: notionDraftText(page, "Ulica"),
    houseNumber: notionDraftText(page, "Číslo domu"),
    addressFormat: notionSelectProperty(page, "Formát adresy"),
    qualifications: notionPreservedText(page, "Kvalifikácie"),
    priceNote: notionDraftText(page, "Cena / poznámka"),
    facebook: notionUrlProperty(page, "Facebook"),
    instagram: notionUrlProperty(page, "Instagram"),
    internalEmail: notionDraftText(page, "Interný e-mail"),
    imageKey: notionDraftText(page, "Obrázok key"),
    verified: notionCheckbox(page, "Overené"),
    featured: notionCheckbox(page, "Odporúčané"),
    qualityResolutions: Object.fromEntries(Object.entries(notionQualityFields).map(
      ([field, key]) => [field, notionQualityValues[notionSelectProperty(page, key)] ?? ""],
    )) as DirectoryQualityResolutionInput,
    seo: {
      title: notionDraftText(page, "SEO title"),
      description: notionDraftText(page, "SEO popis"),
      focusKeyword: notionDraftText(page, "SEO kľúčové slovo"),
      canonicalUrl: notionUrlProperty(page, "Canonical URL"),
      ogTitle: notionDraftText(page, "OG title"),
      ogDescription: notionDraftText(page, "OG popis"),
      ogImage: notionUrlProperty(page, "OG obrázok"),
      noindex: notionCheckbox(page, "Noindex"),
    },
    notionUrl: "https://www.notion.so/" + page.id.replaceAll("-", ""),
  };
}

function requireDirectoryId(env: GeminiNotionReviewEnv) {
  const dataSourceId = env.NOTION_DIRECTORY_DATA_SOURCE_ID?.trim();
  if (!env.NOTION_API_TOKEN?.trim() || !dataSourceId || !/^[a-f\d-]{32,36}$/i.test(dataSourceId))
    throw new GeminiNotionReviewError("CONFIG");
  return dataSourceId;
}

/** Read directly from Notion on demand: results appear without an hourly D1 sync.
 * Only pages marked by the independent agent are exposed as automation concepts.
 */
export async function listGeminiDirectoryDrafts(
  env: GeminiNotionReviewEnv, stableKey: string,
): Promise<GeminiDirectoryDraft[]> {
  const category = validGeminiDirectoryCategory(stableKey);
  if (!category) throw new GeminiNotionReviewError("CATEGORY");
  const dataSourceId = requireDirectoryId(env);
  const drafts: GeminiDirectoryDraft[] = [];
  let cursor: string | null = null;
  for (let batch = 0; batch < 40; batch++) {
    const result: DirectoryQueryResult = await notionRequest<DirectoryQueryResult>(env,
      "/data_sources/" + encodeURIComponent(dataSourceId) + "/query", {
        method: "POST",
        body: JSON.stringify({
          filter: { and: [
            { property: "Vytvoril", rich_text: { equals: GEMINI_NOTION_CREATOR } },
            { property: "Kategória", rich_text: { equals: category.subcategory } },
          ] },
          sorts: [{ timestamp: "created_time", direction: "descending" }],
          page_size: 50,
          ...(cursor ? { start_cursor: cursor } : {}),
        }),
      });
    for (const page of result.results ?? []) {
      if (isExternalGeminiDirectoryDraft(page, dataSourceId) &&
          notionDraftText(page, "Kategória") === category.subcategory) {
        drafts.push(renderDraft(page));
      }
    }
    if (!result.has_more) return enrichCanonical(env, drafts);
    if (!result.next_cursor) throw new GeminiNotionReviewError("CONFIG");
    cursor = result.next_cursor;
  }
  throw new GeminiNotionReviewError("CONFIG"); // Never show incomplete counts.
}

export async function getGeminiDirectoryDraft(
  env: GeminiNotionReviewEnv, rawId: string,
): Promise<GeminiDirectoryDraft> {
  if (!/^[a-f\d]{8}-?[a-f\d]{4}-?[a-f\d]{4}-?[a-f\d]{4}-?[a-f\d]{12}$/i.test(rawId)) {
    throw new GeminiNotionReviewError("ID");
  }
  const dataSourceId = requireDirectoryId(env);
  const page = await notionRequest<DirectoryNotionPage>(
    env, "/pages/" + encodeURIComponent(rawId),
  );
  if (!isExternalGeminiDirectoryDraft(page, dataSourceId))
    throw new GeminiNotionReviewError("NOT_FOUND");
  const draft = renderDraft(page);
  if (!validGeminiDirectoryCategory("directory." + draft.category))
    throw new GeminiNotionReviewError("NOT_FOUND");
  return (await enrichCanonical(env, [draft]))[0];
}

/** Only a verified admin click queues a specific Notion draft for hourly
 * canonical synchronization. Gemini itself cannot invoke this mutation.
 */
export async function approveGeminiDirectoryDraft(
  env: GeminiNotionReviewEnv, id: string, revision: string, actor: string,
) {
  return mutateDraft(env, id, async () => {
    const draft = await getGeminiDirectoryDraft(env, id);
    if (draft.reviewState === "APPROVED") return { status: "PENDING_SYNC" as const };
    requireEditable(draft, revision);
    if (!draft.source.startsWith("https://") || !draft.website.startsWith("https://"))
      throw new GeminiNotionReviewError("STATE");
    await assertReviewSchema(env);
    await patchReview(env, draft, "APPROVE", actor, {
      "Stav": { select: { name: "Publikované" } },
      "Psipedia stav": { select: { name: "Publikované" } },
    });
    return { status: "PENDING_SYNC" as const };
  });
}

const AUDIT_PREFIX = "[Psipedia Gemini review] ";
type ReviewEvent = { action: string; reason?: string; [key: string]: unknown };
function reviewAudit(notes: string): ReviewEvent[] {
  return notes.split("\n").flatMap(line => {
    if (!line.startsWith(AUDIT_PREFIX)) return [];
    try { const event = JSON.parse(line.slice(AUDIT_PREFIX.length));
      return event && typeof event.action === "string" ? [event] : [];
    } catch { return []; }
  });
}
function richReview(value: string) {
  if (value.length > 150000) throw new GeminiNotionReviewError("STATE");
  return { rich_text: Array.from({ length: Math.ceil(value.length / 1800) }, (_, i) =>
    ({ type: "text", text: { content: value.slice(i * 1800, (i + 1) * 1800) } })) };
}
function auditProperties(draft: GeminiDirectoryDraft, action: string, actor: string, reason = "") {
  const event = { action, at: new Date().toISOString(), actor, reason,
    identity: { name: draft.name, city: draft.city, website: draft.website, source: draft.source,
      phone: draft.phone, email: draft.email } };
  return { "Poznámky": richReview(draft.notes + (draft.notes ? "\n" : "") + AUDIT_PREFIX + JSON.stringify(event)),
    "Upravil": richReview(actor) };
}
async function assertReviewSchema(env: GeminiNotionReviewEnv) {
  const schema = await notionRequest<{ properties?: Record<string, { type?: string; select?: { options?: { name: string }[] } }> }>(
    env, "/data_sources/" + requireDirectoryId(env));
  for (const [key, required] of Object.entries({ Stav: ["Na kontrolu", "Publikované", "Archív"], "Psipedia stav": ["Koncept", "Publikované", "Archív"] })) {
    const prop = schema.properties?.[key];
    if (prop?.type !== "select" || required.some(name => !prop.select?.options?.some(option => option.name === name)))
      throw new GeminiNotionReviewError("CONFIG");
  }
  for (const key of ["Poznámky", "Upravil"])
    if (schema.properties?.[key]?.type !== "rich_text") throw new GeminiNotionReviewError("CONFIG");
}
async function patchReview(env: GeminiNotionReviewEnv, draft: GeminiDirectoryDraft, action: string, actor: string,
  properties: Record<string, unknown>, reason = "") {
  const latest = await notionRequest<NotionPage>(env, "/pages/" + encodeURIComponent(draft.id));
  if (!latest.last_edited_time || latest.last_edited_time !== draft.lastEditedAt)
    throw new GeminiNotionReviewError("CONFLICT");
  await notionRequest(env, "/pages/" + encodeURIComponent(draft.id), {
    method: "PATCH", body: JSON.stringify({ properties: { ...properties, ...auditProperties(draft, action, actor, reason) } }),
  }, { retryTransient: false });
}
function requireEditable(draft: GeminiDirectoryDraft, revision: string) {
  if (draft.psipediaId || draft.psipediaStatus !== "Koncept" ||
      !["", "Nápad", "Na kontrolu", "Ready"].includes(draft.editorialState))
    throw new GeminiNotionReviewError("STATE");
  if (!revision || revision !== draft.lastEditedAt) throw new GeminiNotionReviewError("CONFLICT");
}
async function mutateDraft<T>(env: GeminiNotionReviewEnv, id: string, work: () => Promise<T>) {
  if (!/^[a-f\d]{8}-?[a-f\d]{4}-?[a-f\d]{4}-?[a-f\d]{4}-?[a-f\d]{12}$/i.test(id))
    throw new GeminiNotionReviewError("ID");
  if (!env.DB) throw new GeminiNotionReviewError("CONFIG");
  const release = await acquireGeminiNotionLock(env.DB, id);
  if (!release) throw new GeminiNotionReviewError("LOCKED");
  try { const result = await work(); await release(); return result; }
  catch (error) {
    // Validation failed before a write; transport uncertainty retains the lock
    // for operator reconciliation, never an automatic competing retry.
    if (error instanceof GeminiNotionReviewError) await release();
    throw error;
  }
}
async function enrichCanonical(env: GeminiNotionReviewEnv, drafts: GeminiDirectoryDraft[]) {
  if (!env.DB) return drafts;
  for (let offset = 0; offset < drafts.length; offset += 80) {
    const batch = drafts.slice(offset, offset + 80);
    const rows = await env.DB.prepare(`SELECT dns.notion_page_id, dp.id, dp.status FROM directory_notion_sync dns
      JOIN directory_profiles dp ON dp.id = dns.directory_profile_id
      WHERE dns.notion_page_id IN (${batch.map(() => "?").join(",")})`)
      .bind(...batch.map(draft => draft.id)).all<{ notion_page_id: string; id: number; status: string }>();
    const mapped = new Map((rows.results ?? []).map(row => [row.notion_page_id, row]));
    for (const draft of batch) {
      const row = mapped.get(draft.id);
      if (row) {
        draft.canonicalVerified = true;
        draft.psipediaId = String(row.id);
        draft.reviewState = row.status === "published" ? "PUBLISHED" : "IMPORTED";
      }
    }
  }
  return drafts;
}
export async function reviewGeminiDirectoryDraft(env: GeminiNotionReviewEnv, id: string,
  input: { action: "reject" | "restore"; lastEditedAt: string; reason?: string }, actor: string) {
  return mutateDraft(env, id, async () => {
    const draft = await getGeminiDirectoryDraft(env, id);
    if (draft.psipediaId) throw new GeminiNotionReviewError("STATE");
    if (input.action === "reject" && draft.reviewState === "REJECTED") return draft;
    if (input.action === "restore" && draft.reviewState === "IN_PROGRESS" &&
        reviewAudit(draft.notes).at(-1)?.action === "RESTORE") return draft;
    if (!input.lastEditedAt || draft.lastEditedAt !== input.lastEditedAt) throw new GeminiNotionReviewError("CONFLICT");
    if (input.action === "reject" && draft.reviewState !== "APPROVED") requireEditable(draft, input.lastEditedAt);
    else if (input.action !== "reject" && (input.action !== "restore" || draft.reviewState !== "REJECTED")) throw new GeminiNotionReviewError("STATE");
    if (typeof (input.reason ?? "") !== "string" || (input.reason?.length ?? 0) > 1500) throw new GeminiNotionReviewError("STATE");
    await assertReviewSchema(env);
    await patchReview(env, draft, input.action === "reject" ? "REJECT" : "RESTORE", actor, {
      "Stav": { select: { name: input.action === "reject" ? "Archív" : "Na kontrolu" } },
      "Psipedia stav": { select: { name: input.action === "reject" ? "Archív" : "Koncept" } },
    }, input.reason?.trim());
    return getGeminiDirectoryDraft(env, id);
  });
}


/**
 * Reuse the canonical directory editor for a Notion-only Gemini draft.
 * Saving updates the SAME Notion page. Never create a D1 profile or change
 * either publication state on this path.
 */
export async function saveGeminiDirectoryDraft(
  env: GeminiNotionReviewEnv, id: string, raw: unknown, actor: string,
): Promise<GeminiDirectoryDraft> {
  return mutateDraft(env, id, async () => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new GeminiNotionReviewError("STATE");
  const input = raw as Record<string, unknown>;
  const before = await getGeminiDirectoryDraft(env, id);
  if (before.psipediaId || before.psipediaStatus !== "Koncept" ||
      !["", "Nápad", "Na kontrolu", "Ready"].includes(before.editorialState))
    throw new GeminiNotionReviewError("STATE");
  if (!before.lastEditedAt || input.lastEditedAt !== before.lastEditedAt)
    throw new GeminiNotionReviewError("CONFLICT");

  function field(name: string, limit = 16000) {
    const value = input[name];
    if (typeof value !== "string" || value.length > limit)
      throw new GeminiNotionReviewError("STATE");
    return value.trim();
  }
  function list(name: string) {
    const value = input[name];
    if (!Array.isArray(value) || value.length > 40 ||
        !value.every((item) => typeof item === "string" && item.length <= 1800))
      throw new GeminiNotionReviewError("STATE");
    return value.map((item: string) => item.trim()).filter(Boolean).join("\n");
  }
  function rich(value: string) {
    const items = [];
    for (let index = 0; index < value.length; index += 1800)
      items.push({ type: "text", text: { content: value.slice(index, index + 1800) } });
    return { rich_text: items };
  }
  function url(value: string, allowSitePath = false) {
    if (!value) return { url: null };
    const candidate = allowSitePath && /^\/(?:media|images)\//.test(value)
      ? "https://psipedia.sk" + value : value;
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
        throw new Error("bad protocol");
      if (parsed.username || parsed.password) throw new Error("credentials forbidden");
      return { url: candidate };
    } catch { throw new GeminiNotionReviewError("STATE"); }
  }
  const category = field("category", 90);
  if (!validGeminiDirectoryCategory("directory." + category))
    throw new GeminiNotionReviewError("CATEGORY");
  const format = field("addressFormat", 40);
  if (format && format !== "STREET" && format !== "MUNICIPALITY_NUMBER")
    throw new GeminiNotionReviewError("STATE");
  const seo = input.seo;
  if (!seo || typeof seo !== "object" || Array.isArray(seo))
    throw new GeminiNotionReviewError("STATE");
  const seoRecord = seo as Record<string, unknown>;
  const seoText = (name: string, limit = 16000) => {
    const value = seoRecord[name];
    if (typeof value !== "string" || value.length > limit)
      throw new GeminiNotionReviewError("STATE");
    return value.trim();
  };
  const quality = input.qualityResolutions;
  if (!quality || typeof quality !== "object" || Array.isArray(quality))
    throw new GeminiNotionReviewError("STATE");
  const qualityRecord = quality as Record<string, unknown>;
  const qualityProperties: Record<string, unknown> = {};
  for (const [fieldKey, notionKey] of Object.entries(notionQualityFields)) {
    const value = qualityRecord[fieldKey];
    if (typeof value !== "string")
      throw new GeminiNotionReviewError("STATE");
    if (value && !Object.values(notionQualityValues).includes(value as DirectoryQualityResolutionStatus))
      throw new GeminiNotionReviewError("STATE");
    const option = Object.keys(notionQualityValues).find((key) => notionQualityValues[key] === value);
    qualityProperties[notionKey] = { select: option ? { name: option } : null };
  }
  if (typeof input.verified !== "boolean" || typeof input.featured !== "boolean" ||
      typeof seoRecord.noindex !== "boolean")
    throw new GeminiNotionReviewError("STATE");
  const name = field("name", 500);
  if (!name) throw new GeminiNotionReviewError("STATE");
  // All keys below exist in the connected Adresár schema. Publication and
  // synchronization ownership/identity fields are deliberately excluded.
  const properties: Record<string, unknown> = {
    "Názov": { title: [{ type: "text", text: { content: name } }] },
    "Slug": rich(field("slug", 90)),
    "Kategória": rich(category),
    "Perex": rich(field("excerpt")),
    "Popis": rich(field("description")),
    "Služby": rich(list("services")),
    "Kvalifikácie": rich(list("qualifications")),
    "Kraj": rich(field("region")),
    "Okres": rich(field("district")),
    "Mesto": rich(field("city")),
    "Adresa": rich(field("address")),
    "PSČ": rich(field("postalCode", 30)),
    "Ulica": rich(field("street")),
    "Číslo domu": rich(field("houseNumber", 90)),
    "Formát adresy": { select: format ? { name: format } : null },
    "Cena / poznámka": rich(field("priceNote")),
    "Web": url(field("websiteUrl", 2000)),
    "Telefón": { phone_number: field("publicPhone", 100) || null },
    "E-mail": { email: field("publicEmail", 254) || null },
    "Facebook": url(field("facebookUrl", 2000)),
    "Instagram": url(field("instagramUrl", 2000)),
    "Interný e-mail": { email: field("internalEmail", 254) || null },
    "Hlavný obrázok URL": url(field("imageUrl", 2000), true),
    "Obrázok key": rich(field("imageKey", 1000)),
    "Logo URL": url(field("logoUrl", 2000)),
    "Overené": { checkbox: input.verified },
    "Odporúčané": { checkbox: input.featured },
    "SEO title": rich(seoText("title")),
    "SEO popis": rich(seoText("description")),
    "SEO kľúčové slovo": rich(seoText("focusKeyword")),
    "Canonical URL": url(seoText("canonicalUrl", 2000), true),
    "OG title": rich(seoText("ogTitle")),
    "OG popis": rich(seoText("ogDescription")),
    "OG obrázok": url(seoText("ogImage", 2000), true),
    "Noindex": { checkbox: seoRecord.noindex },
    ...qualityProperties,
  };
  await assertReviewSchema(env);
  await patchReview(env, before, "SAVE", actor, properties);
  return getGeminiDirectoryDraft(env, id);
  });
}
