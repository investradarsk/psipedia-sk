import { createOpaqueToken, hashOpaqueToken } from "@/lib/resource-access";

const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

function decodeBase64(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function assertOutreachJsonMutation(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("Požiadavka musí používať application/json.");
  }
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) throw new Error("Cross-origin mutation bola zablokovaná.");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    throw new Error("Cross-site mutation bola zablokovaná.");
  }
}

export async function createOutreachOpaqueToken() {
  const token = createOpaqueToken(32);
  return { token, tokenHash: await hashOpaqueToken(token) };
}

export async function hashOutreachToken(token: string) {
  return hashOpaqueToken(token);
}

export async function sha256Base64Url(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return encodeBase64Url(new Uint8Array(digest));
}

function webhookSecretBytes(secret: string) {
  const clean = secret.trim();
  const encoded = clean.startsWith("whsec_") ? clean.slice(6) : clean;
  return decodeBase64(encoded);
}

export async function verifyOutreachWebhookSignature(input: {
  rawBody: string;
  headers: Headers;
  secret: string;
  now?: Date;
}) {
  const id = input.headers.get("svix-id")?.trim() ?? "";
  const timestamp = input.headers.get("svix-timestamp")?.trim() ?? "";
  const signatures = input.headers.get("svix-signature")?.trim() ?? "";
  const timestampSeconds = Number(timestamp);
  if (!id || !timestamp || !signatures || !Number.isFinite(timestampSeconds)) return false;

  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > WEBHOOK_TOLERANCE_SECONDS) return false;

  let secretBytes: Uint8Array;
  try {
    secretBytes = webhookSecretBytes(input.secret);
  } catch {
    return false;
  }
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signed = new TextEncoder().encode(id + "." + timestamp + "." + input.rawBody);
  for (const candidate of signatures.split(/\s+/)) {
    const [version, encoded, ...extra] = candidate.split(",");
    if (version !== "v1" || !encoded || extra.length) continue;
    try {
      const signature = decodeBase64(encoded);
      if (await crypto.subtle.verify("HMAC", key, signature, signed)) return true;
    } catch {
      // Try the next signature. Providers may rotate signing keys.
    }
  }
  return false;
}
