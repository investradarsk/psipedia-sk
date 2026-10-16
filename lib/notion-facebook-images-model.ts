/** Isolated Notion Facebook-images contract. The old Facebook editorial database is not used. */
export type NotionFacebookImagePage = {
  id: string;
  properties?: Record<string, unknown>;
};

type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
}
function property(page: NotionFacebookImagePage, key: string) {
  return record(page.properties?.[key]);
}
function textParts(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value.map((item) => {
    const part = record(item);
    if (typeof part.plain_text === "string") return part.plain_text;
    return typeof record(part.text).content === "string" ? String(record(part.text).content) : "";
  }).join("").trim();
}
function selection(page: NotionFacebookImagePage, name: string) {
  const state = record(property(page, name).status);
  return typeof state.name === "string" ? state.name : "";
}
export function notionImageSource(page: NotionFacebookImagePage) {
  const files = property(page, "Obrázok").files;
  const file = Array.isArray(files) ? record(files[0]) : {};
  const address = file.type === "file" ? record(file.file).url
    : file.type === "external" ? record(file.external).url : null;
  const url = typeof address === "string" ? address : "";
  // Uploaded file IDs remain stable when Notion refreshes the signed URL.
  const stableAddress = (() => { try { const parsed = new URL(url); return parsed.origin + parsed.pathname; } catch { return url; } })();
  const identity = typeof file.id === "string" && file.id ? file.id : stableAddress;
  return { url, identity };
}
export type FacebookImageSnapshot = {
  name: string;
  caption: string;
  notionState: string;
  allowed: boolean;
  scheduledAt: string | null;
  image: { url: string; identity: string };
  ready: boolean;
  warning: string | null;
};
export function notionFacebookImageSnapshot(page: NotionFacebookImagePage, now = new Date()): FacebookImageSnapshot {
  const name = textParts(property(page, "Názov").title).slice(0, 200);
  const caption = textParts(property(page, "Text na Facebook").rich_text).slice(0, 15000);
  const notionState = selection(page, "Stav");
  const allowed = property(page, "Povoliť publikovanie").checkbox === true;
  const image = notionImageSource(page);
  const raw = record(property(page, "Dátum a čas publikovania").date).start;
  // Reject dates without explicit time zone: local wall-clock guesses risk a wrong publish.
  const formatted = typeof raw === "string" ? raw : "";
  const hasOffset = /T\d{2}:\d{2}.*(?:Z|[+-]\d{2}:\d{2})$/.test(formatted);
  const timestamp = hasOffset ? Date.parse(formatted) : Number.NaN;
  const scheduledAt = Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
  const requested = (notionState === "Schválené" || notionState === "Naplánované") && allowed;
  const warning = !requested ? null : !name ? "Chýba názov."
    : !image.url ? "Chýba obrázok."
    : !scheduledAt ? "Zadaj dátum aj čas s časovým pásmom."
    : timestamp <= now.getTime() ? "Termín už uplynul; nastav nový čas."
    : null;
  return {
    name, caption, notionState, allowed, scheduledAt, image,
    ready: requested && warning === null,
    warning,
  };
}
export function notionFacebookSnapshotFingerprint(snapshot: FacebookImageSnapshot) {
  return JSON.stringify({
    name: snapshot.name, caption: snapshot.caption, notionState: snapshot.notionState,
    allowed: snapshot.allowed, scheduledAt: snapshot.scheduledAt,
    imageIdentity: snapshot.image.identity,
  });
}
export function facebookImagePermalink(remoteId: string): string | null {
  if (/^\d+_\d+$/.test(remoteId)) {
    const [page, id] = remoteId.split("_");
    return "https://www.facebook.com/" + page + "/posts/" + id;
  }
  return /^\d+$/.test(remoteId) ? "https://www.facebook.com/photo.php?fbid=" + remoteId : null;
}
