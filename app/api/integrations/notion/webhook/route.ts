import { env } from "cloudflare:workers";
import { verifyNotionWebhook, UUID, EVENT_TYPES, type NotionWebhookEvent as WebhookEvent } from "@/lib/notion-webhook-contract";
import { enqueueNotionWebhook } from "@/lib/notion-webhook-inbox";
import type { WebhookBindings } from "@/lib/notion-webhook-dispatch";

export { dispatchNotionPageChange } from "@/lib/notion-webhook-dispatch";
export const dynamic = "force-dynamic";

// Verify Notion's HMAC before D1 ingestion. Never acknowledge a write
// until the inbox INSERT succeeds; reconciliation runs on the existing cron.
export async function POST(request: Request) {
  const bindings = env as unknown as WebhookBindings;
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json"))
    return new Response(null, { status: 415 });
  if (Number(request.headers.get("content-length") ?? "0") > 65_536)
    return new Response(null, { status: 413 });
  const body = await request.text();
  if (body.length > 65_536) return new Response(null, { status: 413 });
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { return new Response(null, { status: 400 }); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    return new Response(null, { status: 400 });
  const data = parsed as WebhookEvent & { verification_token?: unknown };

  // Notion's one-time handshake is unsigned. During deliberate setup only,
  // the owner reads the token from restricted Cloudflare real-time logs, sets
  // it as a Worker secret, then disables the setup logging flag.
  if (typeof data.verification_token === "string") {
    if (bindings.NOTION_WEBHOOK_HANDSHAKE_LOG_ENABLED === "true"
        && /^secret_[A-Za-z0-9_-]{12,256}$/.test(data.verification_token)) {
      console.info("notion_webhook_one_time_verification_token", data.verification_token);
    }
    return new Response(null, { status: 204 });
  }

  if (bindings.NOTION_WEBHOOK_SYNC_ENABLED !== "true") {
    console.error("notion_webhook_disabled");
    return new Response(null, { status: 503 });
  }
  if (!await verifyNotionWebhook(body, request.headers.get("x-notion-signature"),
      bindings.NOTION_WEBHOOK_VERIFICATION_TOKEN?.trim() ?? "")) {
    // Distinguish missing/mismatched signature from D1 and dispatch errors.
    // Never log HMAC values, the request body, or integration tokens.
    console.error("notion_webhook_signature_invalid");
    return new Response(null, { status: 401 });
  }
  if (bindings.NOTION_WEBHOOK_SUBSCRIPTION_ID
      && data.subscription_id !== bindings.NOTION_WEBHOOK_SUBSCRIPTION_ID) {
    console.error("notion_webhook_subscription_mismatch");
    return new Response(null, { status: 403 });
  }

  if (!bindings.DB || !bindings.NOTION_API_TOKEN?.trim()) {
    console.error("notion_webhook_not_configured");
    return new Response(null, { status: 503 });
  }
  // Unsupported Notion events do not enter the inbox; all recognized page
  // changes MUST be committed durably before a success acknowledgement.
  if (!EVENT_TYPES.has(data.type ?? "") ||
      !UUID.test(data.entity?.id ?? "") ||
      (data.entity?.type !== "page" && data.entity?.entity_type !== "page")) {
    return Response.json({ received: true, result: "ignored" });
  }
  try {
    await enqueueNotionWebhook(bindings.DB, data, body);
    return Response.json({ received: true, result: "queued" }, { status: 200 });
  } catch {
    // Migration missing or D1 transient failure: ask Notion to retry. Never
    // claim success for an event we have not committed to the durable inbox.
    console.error("notion_webhook_inbox_write_failed");
    return new Response(null, { status: 503 });
  }
}
