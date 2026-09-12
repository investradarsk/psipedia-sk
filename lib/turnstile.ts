import { hashOpaqueToken } from "@/lib/resource-access";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileReplayStore = { claim(tokenHash: string, metadata: { action: string; hostname: string; expiresAt: string; usedAt: string }): Promise<boolean> };

type TurnstileResponse = {
  success?: boolean;
  hostname?: string;
  action?: string;
  challenge_ts?: string;
  "error-codes"?: string[];
};

export async function verifyTurnstile(input: {
  token: string;
  secret: string;
  expectedHostname: string;
  expectedAction: string;
  remoteIp?: string;
  replayStore?: TurnstileReplayStore;
  fetchImpl?: typeof fetch;
  now?: Date;
}) {
  const token = input.token?.trim();
  const secret = input.secret?.trim();
  const expectedHostname = input.expectedHostname?.trim().toLowerCase();
  const expectedAction = input.expectedAction?.trim();
  if (!token || token.length > 4096 || !secret || !expectedHostname || !expectedAction) {
    return { ok: false as const, reason: "configuration_or_token_invalid" };
  }

  const form = new FormData();
  form.set("secret", secret);
  form.set("response", token);
  if (input.remoteIp) form.set("remoteip", input.remoteIp);

  let response: Response;
  try {
    response = await (input.fetchImpl ?? fetch)(SITEVERIFY_URL, { method: "POST", body: form, signal: AbortSignal.timeout(5000) });
  } catch {
    return { ok: false as const, reason: "siteverify_unavailable" };
  }
  if (!response.ok) return { ok: false as const, reason: "siteverify_http_error" };

  let result: TurnstileResponse;
  try {
    result = await response.json() as TurnstileResponse;
  } catch {
    return { ok: false as const, reason: "siteverify_invalid_json" };
  }
  if (!result.success) return { ok: false as const, reason: "siteverify_rejected", errorCodes: result["error-codes"] ?? [] };
  if ((result.hostname ?? "").toLowerCase() !== expectedHostname) return { ok: false as const, reason: "hostname_mismatch" };
  if (result.action !== expectedAction) return { ok: false as const, reason: "action_mismatch" };

  const now = input.now ?? new Date();
  const challengeAt = result.challenge_ts ? Date.parse(result.challenge_ts) : NaN;
  if (!Number.isFinite(challengeAt) || Math.abs(now.getTime() - challengeAt) > 5 * 60 * 1000) {
    return { ok: false as const, reason: "challenge_expired" };
  }

  if (input.replayStore) {
    const claimed = await input.replayStore.claim(await hashOpaqueToken(token), {
      action: expectedAction,
      hostname: expectedHostname,
      usedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
    });
    if (!claimed) return { ok: false as const, reason: "replay_detected" };
  }

  return { ok: true as const, challengeAt: new Date(challengeAt).toISOString() };
}

export function createD1TurnstileReplayStore(db: D1Database): TurnstileReplayStore {
  return {
    async claim(tokenHash, metadata) {
      try {
        await db.prepare(`INSERT INTO turnstile_token_uses (token_hash, action, hostname, expires_at, used_at) VALUES (?1, ?2, ?3, ?4, ?5)`)
          .bind(tokenHash, metadata.action, metadata.hostname, metadata.expiresAt, metadata.usedAt).run();
        return true;
      } catch {
        return false;
      }
    },
  };
}
