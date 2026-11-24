import type { NotionAuditPage } from "./notion-data-quality-audit.ts";

const UUID = /^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i;
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Validate the provider envelope before interpreting missing rows as zero. */
export function readAuditList(value: unknown) {
  if (!record(value) || !Array.isArray(value.results) || typeof value.has_more !== "boolean") {
    throw new Error("AUDIT_RESPONSE_INCOMPLETE");
  }
  if (value.results.length > 100) throw new Error("AUDIT_BATCH_LIMIT");
  const next = typeof value.next_cursor === "string" && value.next_cursor.trim() && value.next_cursor.length <= 500
    ? value.next_cursor : null;
  return {
    results: value.results as unknown[],
    hasMore: value.has_more,
    nextCursor: value.has_more ? next : null,
    inconsistent: value.has_more ? !next : value.next_cursor !== null && value.next_cursor !== undefined,
  };
}

export function readNotionAuditBatch(value: unknown, requestedCursor: string | null) {
  const result = readAuditList(value);
  const seen = new Set<string>();
  const pages: NotionAuditPage[] = [];
  for (const page of result.results) {
    if (!record(page) || typeof page.id !== "string" || !UUID.test(page.id)
        || page.object !== "page" || !record(page.properties)
        || !record(page.properties["Psipedia ID"])) {
      throw new Error("AUDIT_RESPONSE_INCOMPLETE");
    }
    const id = page.id.replace(/-/g, "").toLowerCase();
    if (seen.has(id)) throw new Error("AUDIT_DUPLICATE_PAGE");
    seen.add(id);
    pages.push(page as NotionAuditPage);
  }
  const truncated = result.inconsistent || (result.hasMore && result.nextCursor === requestedCursor);
  return { pages, hasMore: result.hasMore, nextCursor: truncated ? null : result.nextCursor, truncated };
}

export function auditReadFailure(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const codes = new Set(["AUDIT_RESPONSE_INCOMPLETE", "AUDIT_BATCH_LIMIT", "AUDIT_DUPLICATE_PAGE",
    "AUDIT_SOURCE_DISCOVERY_LIMIT", "AUDIT_SOURCE_SCHEMA", "AUDIT_SOURCE_INCOMPLETE", "AUDIT_TIMEOUT"]);
  if (codes.has(message)) return message;
  const status = /^Notion API (\d{3}):/.exec(message)?.[1];
  if (status === "401" || status === "403") return "NOTION_ACCESS_DENIED";
  if (status === "404") return "NOTION_SOURCE_NOT_FOUND";
  if (status === "429") return "NOTION_RATE_LIMIT";
  if (status === "400") return "NOTION_REQUEST_REJECTED";
  if (status && Number(status) >= 500) return "NOTION_SERVICE_UNAVAILABLE";
  if (/timeout|timed out/i.test(message)) return "AUDIT_TIMEOUT";
  return "AUDIT_READ_FAILED";
}
