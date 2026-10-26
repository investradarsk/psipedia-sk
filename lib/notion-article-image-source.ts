/**
 * Read a Notion article hero from its existing URL field or the optional
 * "Titulný obrázok" Files & media property.
 *
 * An explicitly entered public URL keeps its legacy priority. When no URL is
 * supplied, use the uploaded Notion file (the same mechanism as FB images).
 * The stable file ID, not an expiring signed download URL, is the revision key.
 */
export type NotionArticleImageSource = {
  url: string;
  identity: string;
  fileIdentity: string | null;
  kind: "url" | "file" | "none";
};

type NotionPageMedia = { properties?: Record<string, unknown> };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function notionArticleMainImageSource(page: NotionPageMedia): NotionArticleImageSource {
  const properties = record(page.properties);
  const url = record(properties["Hlavný obrázok URL"]).url;
  // Keep the current canonical URL field authoritative when both are present.
  if (typeof url === "string" && url.trim()) {
    return { url: url.trim(), identity: url.trim(), fileIdentity: null, kind: "url" };
  }

  const files = record(properties["Titulný obrázok"]).files;
  if (!Array.isArray(files) || files.length === 0) {
    return { url: "", identity: "", fileIdentity: null, kind: "none" };
  }
  if (files.length !== 1) {
    throw new Error("Titulný obrázok musí obsahovať presne jeden súbor.");
  }
  const file = record(files[0]);
  const kind = file.type;
  const location = kind === "file" ? record(file.file) : kind === "external" ? record(file.external) : {};
  const remoteUrl = location.url;
  if (typeof remoteUrl !== "string" || !remoteUrl.startsWith("https://")) {
    throw new Error("Titulný obrázok musí mať dostupnú HTTPS adresu.");
  }
  const fileId = typeof file.id === "string" && file.id.trim() ? file.id.trim() : null;
  // Notion-uploaded files must have an ID so signed URL rotation cannot cause
  // repeated imports. External files are stable by their original URL.
  if (kind === "file" && !fileId) {
    throw new Error("Titulnému obrázku chýba stabilné ID súboru v Notione.");
  }
  const identity = kind === "file" ? `notion-file:${fileId}` : `notion-external:${remoteUrl}`;
  return { url: remoteUrl, identity, fileIdentity: identity, kind: "file" };
}
