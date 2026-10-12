import { getGeminiCatalogItem } from "@/lib/gemini-automation-catalog";
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
  constructor(public readonly code: "CATEGORY" | "ID" | "NOT_FOUND" | "STATE" | "CONFIG") {
    super(code);
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
    summary: notionDraftText(page, "Perex"),
    description: notionDraftText(page, "Popis"),
    services: notionDraftText(page, "Služby"),
    source: notionUrlProperty(page, "Zdroj dát"),
    editorialState: notionSelectProperty(page, "Stav"),
    psipediaStatus: notionSelectProperty(page, "Psipedia stav"),
    psipediaId: notionDraftText(page, "Psipedia ID"),
    createdAt: page.created_time ?? "",
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
