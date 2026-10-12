import { getGeminiCatalogItem } from "@/lib/gemini-automation-catalog";
import type { DirectoryQualityResolutionInput, DirectoryQualityResolutionStatus } from "@/lib/directory-profile-metadata";
import {
  notionRequest, notionRichTextProperty, notionSelectProperty,
  notionTitleProperty, notionUrlProperty, notionPropertyRecord,
  type NotionPage,
} from "@/lib/notion-sync-shared";

export const GEMINI_NOTION_CREATOR = "Gemini automatizácia";

export type GeminiNotionReviewEnv = {
  NOTION_API_TOKEN?: string;
  NOTION_DIRECTORY_DATA_SOURCE_ID?: string;
};

export type GeminiDirectoryDraft = {
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
  readonly code: "CATEGORY" | "ID" | "NOT_FOUND" | "STATE" | "CONFIG" | "CONFLICT";
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
    !!notionTitleProperty(page, "Názov") &&
    !notionDraftText(page, "Psipedia ID");
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
  return {
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
  for (let batch = 0; batch < 3; batch++) {
    const result = await notionRequest<DirectoryQueryResult>(env,
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
          notionDraftText(page, "Kategória") === category.subcategory &&
          notionSelectProperty(page, "Psipedia stav") === "Koncept") {
        drafts.push(renderDraft(page));
      }
    }
    if (!result.has_more || !result.next_cursor) break;
    cursor = result.next_cursor;
  }
  return drafts;
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
  return draft;
}

/** Only a verified admin click queues a specific Notion draft for hourly
 * canonical synchronization. Gemini itself cannot invoke this mutation.
 */
export async function approveGeminiDirectoryDraft(
  env: GeminiNotionReviewEnv, id: string,
) {
  const draft = await getGeminiDirectoryDraft(env, id);
  if (draft.psipediaStatus !== "Koncept" ||
      !["", "Nápad", "Na kontrolu", "Ready"].includes(draft.editorialState)) {
    throw new GeminiNotionReviewError("STATE");
  }
  if (!draft.source.startsWith("https://") || !draft.website.startsWith("https://"))
    throw new GeminiNotionReviewError("STATE");
  await notionRequest(env, "/pages/" + encodeURIComponent(draft.id), {
    method: "PATCH",
    body: JSON.stringify({
      properties: {
        "Stav": { select: { name: "Publikované" } },
        "Psipedia stav": { select: { name: "Publikované" } },
      },
    }),
  });
  return { status: "PENDING_SYNC" as const };
}


/**
 * Reuse the canonical directory editor for a Notion-only Gemini draft.
 * Saving updates the SAME Notion page. Never create a D1 profile or change
 * either publication state on this path.
 */
export async function saveGeminiDirectoryDraft(
  env: GeminiNotionReviewEnv, id: string, raw: unknown,
): Promise<GeminiDirectoryDraft> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new GeminiNotionReviewError("STATE");
  const input = raw as Record<string, unknown>;
  const before = await getGeminiDirectoryDraft(env, id);
  if (before.psipediaStatus !== "Koncept" ||
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
  await notionRequest(env, "/pages/" + encodeURIComponent(id), {
    method: "PATCH",
    body: JSON.stringify({ properties }),
  }, { retryTransient: false });
  return getGeminiDirectoryDraft(env, id);
}
