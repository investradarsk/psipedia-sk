export const PARTNER_SESSION_COOKIE = "psipedia_partner_session";
export const PARTNER_PASSWORD_ITERATIONS = 150_000;
export const PARTNER_SESSION_DAYS = 30;

const encoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomBytes(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function normalizePartnerEmail(value: unknown) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error("Zadajte platný e-mail.");
  }
  return email;
}

export function normalizePartnerDisplayName(value: unknown) {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (name.length < 2 || name.length > 120) throw new Error("Meno musí mať 2 až 120 znakov.");
  return name;
}

export function validatePartnerPassword(value: unknown) {
  const password = typeof value === "string" ? value : "";
  if (password.length < 10 || password.length > 128) throw new Error("Heslo musí mať 10 až 128 znakov.");
  if (!/[A-Za-zÀ-ž]/.test(password) || !/\d/.test(password)) {
    throw new Error("Heslo musí obsahovať písmeno aj číslo.");
  }
  return password;
}

export async function hashPartnerPassword(
  password: string,
  salt = bytesToBase64Url(randomBytes(18)),
  iterations = PARTNER_PASSWORD_ITERATIONS,
) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const saltBytes = encoder.encode(salt);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations },
    key,
    256,
  );
  return { hash: bytesToHex(new Uint8Array(bits)), salt, iterations };
}

export async function verifyPartnerPassword(
  password: string,
  expectedHash: string,
  salt: string,
  iterations: number,
) {
  const actual = await hashPartnerPassword(password, salt, iterations);
  return constantTimeTextEqual(actual.hash, expectedHash);
}

export function createOpaqueToken() {
  return bytesToBase64Url(randomBytes(32));
}

export async function hashOpaqueToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return bytesToHex(new Uint8Array(digest));
}

export function constantTimeTextEqual(left: string, right: string) {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    diff |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return diff === 0;
}

export function partnerSessionCookie(token: string, requestUrl: string) {
  const secure = new URL(requestUrl).protocol === "https:" ? "; Secure" : "";
  const maxAge = PARTNER_SESSION_DAYS * 24 * 60 * 60;
  return `${PARTNER_SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearPartnerSessionCookie(requestUrl: string) {
  const secure = new URL(requestUrl).protocol === "https:" ? "; Secure" : "";
  return `${PARTNER_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function readCookie(header: string | null, name: string) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=") || null;
  }
  return null;
}

export function safePartnerReturnPath(value: unknown) {
  const input = typeof value === "string" ? value : "/partner";
  if (!input.startsWith("/") || input.startsWith("//")) return "/partner";
  try {
    const parsed = new URL(input, "https://partner.local");
    if (parsed.origin !== "https://partner.local") return "/partner";
    if (!parsed.pathname.startsWith("/partner")) return "/partner";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/partner";
  }
}

export function assertPartnerJsonMutation(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new Error("Neplatný formát požiadavky.");
  }
  const target = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin && origin !== target.origin) throw new Error("Neplatný pôvod požiadavky.");
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "same-site" && site !== "none") {
    throw new Error("Neplatný pôvod požiadavky.");
  }
}

export function partnerRateIdentity(request: Request) {
  return request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
}
