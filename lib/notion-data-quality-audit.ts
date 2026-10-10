import { classifyDirectorySyncError } from "./notion-data-quality-recovery.ts";

export type NotionAuditAgenda = "directory" | "events" | "organizations";

type NotionProperty = Record<string, unknown>;
export type NotionAuditPage = {
  id: string;
  url?: string;
  properties?: Record<string, NotionProperty>;
};

function plainText(items: unknown): string {
  if (!Array.isArray(items)) return "";
  return items.map((item) => {
    if (!item || typeof item !== "object") return "";
    const text = item as Record<string, unknown>;
    if (typeof text.plain_text === "string") return text.plain_text;
    if (text.text && typeof text.text === "object") {
      const content = (text.text as Record<string, unknown>).content;
      return typeof content === "string" ? content : "";
    }
    return "";
  }).join("").trim();
}

function field(page: NotionAuditPage, name: string) {
  const property = page.properties?.[name];
  if (!property) return "";
  if (Array.isArray(property.rich_text)) return plainText(property.rich_text);
  if (Array.isArray(property.title)) return plainText(property.title);
  if (property.select && typeof property.select === "object") {
    const name = (property.select as Record<string, unknown>).name;
    return typeof name === "string" ? name : "";
  }
  return "";
}

function number(page: NotionAuditPage, name: string) {
  const value = page.properties?.[name]?.number;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function checked(page: NotionAuditPage, name: string) {
  return page.properties?.[name]?.checkbox === true;
}

export function summarizeNotionAuditBatch(
  agenda: NotionAuditAgenda,
  pages: NotionAuditPage[],
) {
  const summary = {
    examined: pages.length,
    linked: 0,
    syncErrors: 0,
    conflictErrors: 0,
    addressPresent: 0,
    publicCoordinates: 0,
    googlePlaceCurrent: 0,
    googleNotRequired: 0,
    errorTypes: {} as Record<string, number>,
    /** Bounded to one source page; only IDs, kinds, no personal values. */
    reviewItems: [] as Array<{
      notionPageId: string;
      psipediaId: string;
      kind: string;
      nextStep: "REVIEW_FIELDS" | "VALIDATE_SOURCE" | "INVESTIGATE_RUNTIME";
    }>,
  };

  for (const page of pages) {
    const id = field(page, "Psipedia ID");
    if (id) summary.linked += 1;
    if (field(page, "Adresa") || field(page, "Miesto")) summary.addressPresent += 1;
    if (number(page, "Latitude") !== null && number(page, "Longitude") !== null) {
      summary.publicCoordinates += 1;
    }
    if (checked(page, "Google miesto aktuálne")) summary.googlePlaceCurrent += 1;
    if (checked(page, "Google Maps netreba")) summary.googleNotRequired += 1;

    const error = field(page, "Sync chyba");
    if (!error) continue;
    summary.syncErrors += 1;
    const kind = agenda === "directory"
      ? classifyDirectorySyncError(error)
      : error.startsWith("CONFLICT:") ? "BIDIRECTIONAL_CONFLICT" : "OTHER";
    if (error.startsWith("CONFLICT:")) summary.conflictErrors += 1;
    summary.errorTypes[kind] = (summary.errorTypes[kind] ?? 0) + 1;

    const nextStep = kind === "ILLEGAL_INVOCATION"
      ? "INVESTIGATE_RUNTIME" as const
      : kind === "BIDIRECTIONAL_CONFLICT"
        ? "REVIEW_FIELDS" as const
        : "VALIDATE_SOURCE" as const;

    summary.reviewItems.push({
      notionPageId: page.id,
      psipediaId: id,
      kind,
      nextStep,
    });
  }
  return summary;
}
