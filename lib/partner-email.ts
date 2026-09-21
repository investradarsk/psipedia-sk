import { env } from "cloudflare:workers";

type Bindings = { RESEND_API_KEY?: string; EDITORIAL_FROM_EMAIL?: string };
const ENDPOINT = "https://api.resend.com/emails";

async function sendPartnerEmail(to: string, subject: string, text: string, idempotencyKey: string) {
  const bindings = env as unknown as Bindings;
  const apiKey = bindings.RESEND_API_KEY?.trim();
  const from = bindings.EDITORIAL_FROM_EMAIL?.trim();
  if (!apiKey || !from) return { ok: false as const, error: "email_not_configured" };
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ from, to, subject, text }),
      signal: AbortSignal.timeout(8_000),
    });
    return response.ok ? { ok: true as const } : { ok: false as const, error: `resend_http_${response.status}` };
  } catch {
    return { ok: false as const, error: "resend_request_failed" };
  }
}

function safeOrigin(value: string) {
  const origin = new URL(value);
  if (origin.protocol !== "https:" && origin.hostname !== "localhost") throw new Error("Neplatný origin.");
  return origin.origin;
}

export function sendPartnerVerificationEmail(input: { email: string; displayName: string; token: string; origin: string }) {
  const url = `${safeOrigin(input.origin)}/partner/overit-email?token=${encodeURIComponent(input.token)}`;
  return sendPartnerEmail(
    input.email,
    "Overte e-mail pre partner účet Psipedia",
    `Dobrý deň ${input.displayName},\n\npre dokončenie overenia partner účtu otvorte tento odkaz:\n${url}\n\nOdkaz platí 24 hodín.\n\nPsipedia.sk`,
    `partner-verify/${input.email}/${input.token.slice(0, 12)}`,
  );
}

export function sendPartnerPasswordResetEmail(input: { email: string; displayName: string; token: string; origin: string }) {
  const url = `${safeOrigin(input.origin)}/partner/nove-heslo?token=${encodeURIComponent(input.token)}`;
  return sendPartnerEmail(
    input.email,
    "Obnova hesla partner účtu Psipedia",
    `Dobrý deň ${input.displayName},\n\nnové heslo si nastavíte cez tento odkaz:\n${url}\n\nOdkaz platí 60 minút. Ak ste obnovu nežiadali, správu ignorujte.\n\nPsipedia.sk`,
    `partner-reset/${input.email}/${input.token.slice(0, 12)}`,
  );
}
