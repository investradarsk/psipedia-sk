import { env } from "cloudflare:workers";
import { processOutreachDeliveryEvent } from "@/lib/outreach-store";
import { verifyOutreachWebhookSignature } from "@/lib/outreach-security";

export const dynamic = "force-dynamic";

type RuntimeBindings = {
  OUTREACH_PROVIDER?: string;
  OUTREACH_WEBHOOK_SECRET?: string;
};

export async function POST(request: Request) {
  const bindings = env as unknown as RuntimeBindings;
  const secret = bindings.OUTREACH_WEBHOOK_SECRET?.trim();
  const providerKey = bindings.OUTREACH_PROVIDER?.trim().toLowerCase() ?? "";
  if (!secret || providerKey !== "resend") {
    return Response.json({ error: "Outreach webhook nie je nakonfigurovaný." }, { status: 503 });
  }

  const rawBody = await request.text();
  const verified = await verifyOutreachWebhookSignature({
    rawBody,
    headers: request.headers,
    secret,
  });
  if (!verified) return Response.json({ error: "Neplatný webhook podpis." }, { status: 401 });

  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    payload = parsed as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Neplatný webhook payload." }, { status: 400 });
  }

  const providerEventId = request.headers.get("svix-id")?.trim() ?? "";
  const eventType = typeof payload.type === "string" ? payload.type : "";
  if (!providerEventId || !eventType) {
    return Response.json({ error: "Webhook nemá event ID alebo typ." }, { status: 400 });
  }

  const result = await processOutreachDeliveryEvent({
    providerEventId,
    providerKey,
    eventType,
    rawBody,
    payload,
  });
  return Response.json({ result });
}
