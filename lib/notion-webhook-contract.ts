/** Raw-body Notion HMAC, event scope and metadata echo detection. */
export type NotionWebhookEvent = {
  id?: string;
  type?: string;
  subscription_id?: string;
  entity?: { id?: string; type?: string; entity_type?: string };
  data?: { updated_properties?: string[] };
};

export type WebhookPageProperties = { properties?: Record<string, unknown> };
export const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export const EVENT_TYPES = new Set(["page.created", "page.properties_updated", "page.content_updated"]);
const SYNC_ONLY = new Set([
  "Sync stav", "Sync chyba", "Sync hash", "Posledný sync",
  "Psipedia ID", "URL Psipedia", "Dátum publikácie",
]);

/** Verify the raw body with WebCrypto; no secret is ever sent to the browser. */
export async function verifyNotionWebhook(body: string, signature: string | null, secret: string): Promise<boolean> {
  const matched = /^sha256=([0-9a-f]{64})$/i.exec(signature ?? "");
  if (!matched || !secret) return false;
  const digest = new Uint8Array(matched[1].match(/../g)!.map(value => parseInt(value, 16)));
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
  );
  return crypto.subtle.verify("HMAC", key, digest, new TextEncoder().encode(body));
}

export function sameSource(left: string | undefined, right: string | undefined) {
  if (!left || !right) return false;
  return left.replaceAll("-", "").toLowerCase() === right.replaceAll("-", "").toLowerCase();
}

/**
 * Notion supplies property IDs (not values), occasionally property names.
 * A metadata-only echo is not a human editorial change. If Notion omits the
 * changes list we conservatively run the existing hash-based reconciliation.
 */
export function metadataOnlyChange(event: NotionWebhookEvent, page: WebhookPageProperties) {
  if (event.type !== "page.properties_updated" || !event.data?.updated_properties?.length) return false;
  const names = new Map<string, string>();
  for (const [name, raw] of Object.entries(page.properties ?? {})) {
    const id = raw && typeof raw === "object" ? (raw as { id?: unknown }).id : undefined;
    if (typeof id === "string") names.set(id, name);
    names.set(name, name);
  }
  return event.data.updated_properties.every(id => SYNC_ONLY.has(names.get(id) ?? ""));
}

