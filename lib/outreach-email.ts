import { env } from "cloudflare:workers";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const PROVIDER_TIMEOUT_MS = 8_000;

export type OutreachEmailBindings = {
  OUTREACH_PROVIDER?: string;
  OUTREACH_SEND_ENABLED?: string;
  OUTREACH_FROM_EMAIL?: string;
  OUTREACH_WEBHOOK_SECRET?: string;
  RESEND_API_KEY?: string;
};

export type OutreachEmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  idempotencyKey: string;
};

export type OutreachEmailResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; error: string };

export interface OutreachEmailProvider {
  readonly key: string;
  send(message: OutreachEmailMessage): Promise<OutreachEmailResult>;
}

class ResendOutreachEmailProvider implements OutreachEmailProvider {
  readonly key = "resend";

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: OutreachEmailMessage): Promise<OutreachEmailResult> {
    try {
      const response = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          authorization: "Bearer " + this.apiKey,
          "content-type": "application/json",
          "Idempotency-Key": message.idempotencyKey,
        },
        body: JSON.stringify({
          from: this.from,
          to: message.to,
          subject: message.subject.replace(/[\r\n]+/g, " ").trim().slice(0, 240),
          text: message.text,
          ...(message.html ? { html: message.html } : {}),
        }),
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      });
      if (!response.ok) return { ok: false, error: "resend_http_" + response.status };
      try {
        const payload = await response.json() as { id?: unknown };
        return {
          ok: true,
          providerMessageId: typeof payload.id === "string" ? payload.id : null,
        };
      } catch {
        return { ok: true, providerMessageId: null };
      }
    } catch {
      return { ok: false, error: "resend_request_failed" };
    }
  }
}

function bindingsOrRuntime(bindings?: OutreachEmailBindings) {
  return bindings ?? env as unknown as OutreachEmailBindings;
}

export function getOutreachProviderStatus(bindings?: OutreachEmailBindings) {
  const resolved = bindingsOrRuntime(bindings);
  if (resolved.OUTREACH_SEND_ENABLED !== "1") {
    return { configured: false, providerKey: "", reason: "outreach_send_disabled" } as const;
  }
  const providerKey = resolved.OUTREACH_PROVIDER?.trim().toLowerCase() ?? "";
  if (providerKey !== "resend") {
    return {
      configured: false,
      providerKey,
      reason: providerKey ? "unsupported_outreach_provider" : "missing_outreach_provider",
    } as const;
  }
  if (!resolved.RESEND_API_KEY?.trim()) {
    return { configured: false, providerKey, reason: "missing_resend_api_key" } as const;
  }
  if (!resolved.OUTREACH_FROM_EMAIL?.trim()) {
    return { configured: false, providerKey, reason: "missing_outreach_from_email" } as const;
  }
  return { configured: true, providerKey, reason: null } as const;
}

export function getOutreachEmailProvider(bindings?: OutreachEmailBindings): OutreachEmailProvider | null {
  const resolved = bindingsOrRuntime(bindings);
  const status = getOutreachProviderStatus(resolved);
  if (!status.configured || status.providerKey !== "resend") return null;
  return new ResendOutreachEmailProvider(
    resolved.RESEND_API_KEY!.trim(),
    resolved.OUTREACH_FROM_EMAIL!.trim(),
  );
}
