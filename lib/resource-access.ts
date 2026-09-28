const encoder = new TextEncoder();

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function createOpaqueToken(byteLength = 32) {
  if (byteLength < 32) throw new Error("Opaque tokens must contain at least 256 bits of entropy");
  return base64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function hashOpaqueToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return base64Url(new Uint8Array(digest));
}

export function isStoredTokenUsable(record: { expiresAt: string; usedAt?: string | null; revokedAt?: string | null }, now = new Date()) {
  if (record.usedAt || record.revokedAt) return false;
  const expiry = Date.parse(record.expiresAt);
  return Number.isFinite(expiry) && expiry > now.getTime();
}

export function isManagementSessionUsable(record: { expiresAt: string; revokedAt?: string | null }, now = new Date()) {
  if (record.revokedAt) return false;
  const expiry = Date.parse(record.expiresAt);
  return Number.isFinite(expiry) && expiry > now.getTime();
}

export function buildManagementSessionCookie(name: string, token: string, maxAgeSeconds: number) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(name)) throw new Error("Invalid cookie name");
  if (!Number.isInteger(maxAgeSeconds) || maxAgeSeconds <= 0 || maxAgeSeconds > 60 * 60 * 24 * 7) throw new Error("Invalid management session lifetime");
  return `${name}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearManagementSessionCookie(name: string) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(name)) throw new Error("Invalid cookie name");
  return `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}
