import { getGeminiCatalogItem } from "./gemini-automation-catalog.ts";
import { notionRequest, type NotionPage } from "./notion-sync-shared.ts";

export type GeminiProvenanceAgenda = "directory" | "events" | "organizations" |
  "adoptions" | "help-cases" | "lost-found";
export type GeminiCreatedPage = {
  notion_page_id: string; stable_key: string; notion_data_source_id: string;
};
export type GeminiProvenanceEnv = {
  NOTION_API_TOKEN?: string;
  NOTION_DIRECTORY_DATA_SOURCE_ID?: string;
  NOTION_EVENTS_DATA_SOURCE_ID?: string;
  NOTION_ORGANIZATIONS_DATA_SOURCE_ID?: string;
  NOTION_ADOPTIONS_DATA_SOURCE_ID?: string;
  NOTION_HELP_DATA_SOURCE_ID?: string;
  NOTION_LOST_FOUND_DATA_SOURCE_ID?: string;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const normalizedId = (id: string) => id.replaceAll("-", "").toLowerCase();

export function geminiImportAgenda(stableKey: string): GeminiProvenanceAgenda | null {
  if (!getGeminiCatalogItem(stableKey)) return null;
  if (stableKey.startsWith("directory.")) return "directory";
  if (stableKey.startsWith("events.")) return "events";
  if (stableKey === "help.utulky") return "organizations";
  if (stableKey === "help.adopcia") return "adoptions";
  if (stableKey === "help.stratene-a-najdene") return "lost-found";
  if (stableKey.startsWith("help.")) return "help-cases";
  return null;
}
export function expectedGeminiNotionSource(env: GeminiProvenanceEnv, agenda: GeminiProvenanceAgenda) {
  const name = ({
    directory: "NOTION_DIRECTORY_DATA_SOURCE_ID",
    events: "NOTION_EVENTS_DATA_SOURCE_ID",
    organizations: "NOTION_ORGANIZATIONS_DATA_SOURCE_ID",
    adoptions: "NOTION_ADOPTIONS_DATA_SOURCE_ID",
    "help-cases": "NOTION_HELP_DATA_SOURCE_ID",
    "lost-found": "NOTION_LOST_FOUND_DATA_SOURCE_ID",
  } as const)[agenda];
  return env[name]?.trim() ?? "";
}
export function parseGeminiCreatedPages(value: unknown, jobKey: string, count: number,
  env: GeminiProvenanceEnv): { pages: GeminiCreatedPage[]; agenda: GeminiProvenanceAgenda } | null {
  const agenda = geminiImportAgenda(jobKey);
  if (!agenda || !Array.isArray(value) || value.length !== count || count < 0 || count > 5) return null;
  const source = expectedGeminiNotionSource(env, agenda);
  if (!UUID.test(source)) return null;
  const seen = new Set<string>();
  const pages: GeminiCreatedPage[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
    const row = candidate as Record<string, unknown>;
    if (Object.keys(row).sort().join(",") !== "notion_data_source_id,notion_page_id,stable_key" ||
      typeof row.notion_page_id !== "string" || !UUID.test(row.notion_page_id) ||
      row.stable_key !== jobKey || typeof row.notion_data_source_id !== "string" ||
      normalizedId(row.notion_data_source_id) !== normalizedId(source) ||
      seen.has(normalizedId(row.notion_page_id))) return null;
    seen.add(normalizedId(row.notion_page_id));
    pages.push({ notion_page_id: row.notion_page_id, stable_key: jobKey,
      notion_data_source_id: source });
  }
  return { pages, agenda };
}
/** Read-back is compulsory. Neither agent-supplied identity nor Notion text is authoritative alone. */
export async function verifyGeminiCreatedPages(env: GeminiProvenanceEnv, pages: GeminiCreatedPage[]) {
  if (!env.NOTION_API_TOKEN) throw Error("GEMINI_PROVENANCE_NOTION_CONFIG");
  for (const page of pages) {
    const remote = await notionRequest<NotionPage & {
      parent?: { type?: string; data_source_id?: string };
      archived?: boolean; in_trash?: boolean;
    }>(env, "/pages/" + encodeURIComponent(page.notion_page_id));
    if (normalizedId(remote.id) !== normalizedId(page.notion_page_id) ||
      normalizedId(remote.parent?.data_source_id ?? "") !== normalizedId(page.notion_data_source_id) ||
      remote.archived || remote.in_trash)
      throw Error("GEMINI_PROVENANCE_PAGE_MISMATCH");
  }
}
/** D1 record identity is immutable even on replay or other-job cross-reference. */
export async function registerGeminiCreatedPages(db: D1Database, jobId: number,
  parsed: { pages: GeminiCreatedPage[]; agenda: GeminiProvenanceAgenda }) {
  for (const page of parsed.pages) {
    await db.prepare(
      "INSERT INTO gemini_notion_created_pages " +
      "(notion_page_id,job_id,stable_key,notion_data_source_id,import_agenda) " +
      "VALUES (?,?,?,?,?) ON CONFLICT(notion_page_id) DO NOTHING"
    ).bind(page.notion_page_id, jobId, page.stable_key,
      page.notion_data_source_id, parsed.agenda).run();
    const row = await db.prepare(
      "SELECT job_id,stable_key,notion_data_source_id,import_agenda FROM gemini_notion_created_pages WHERE notion_page_id=?"
    ).bind(page.notion_page_id).first<{
      job_id: number; stable_key: string; notion_data_source_id: string; import_agenda: string;
    }>();
    if (!row || row.job_id !== jobId || row.stable_key !== page.stable_key ||
      row.import_agenda !== parsed.agenda ||
      normalizedId(row.notion_data_source_id) !== normalizedId(page.notion_data_source_id))
      throw Error("GEMINI_PROVENANCE_COLLISION");
  }
}
