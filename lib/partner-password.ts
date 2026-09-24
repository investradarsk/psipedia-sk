import { timingSafeEqual } from "node:crypto";

const encoder = new TextEncoder();

export const PARTNER_PASSWORD_MIN_LENGTH = 12;
export const PARTNER_PASSWORD_MAX_LENGTH = 1024;
export const PARTNER_PASSWORD_PBKDF2_ITERATIONS = 600_000;
export const PARTNER_PASSWORD_HASH_VERSION = 1;
const SALT_BYTES = 16;
const HASH_BYTES = 32;
const PREFIX = "pbkdf2-sha256";
export const PARTNER_DUMMY_PASSWORD_HASH =
  "pbkdf2-sha256$1$600000$ABEiM0RVZneImaq7zN3u_w$TzxKGVUQLy-vJTtr0glnfeXlBcj0C1_ReQTNol8LKxs";

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid password hash encoding");
  const pad = "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export class PartnerPasswordError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function validatePartnerPassword(value: unknown) {
  if (typeof value !== "string") throw new PartnerPasswordError("Zadajte heslo.");
  const length = [...value].length;
  if (length < PARTNER_PASSWORD_MIN_LENGTH) {
    throw new PartnerPasswordError(`Heslo musí mať aspoň ${PARTNER_PASSWORD_MIN_LENGTH} znakov.`);
  }
  if (length > PARTNER_PASSWORD_MAX_LENGTH || encoder.encode(value).byteLength > 4096) {
    throw new PartnerPasswordError("Heslo je príliš dlhé.");
  }
  return value;
}

export function validatePartnerPasswordConfirmation(password: unknown, confirmation: unknown) {
  const value = validatePartnerPassword(password);
  if (typeof confirmation !== "string" || confirmation !== value) {
    throw new PartnerPasswordError("Heslá sa nezhodujú.");
  }
  return value;
}

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

export async function hashPartnerPassword(password: unknown) {
  const value = validatePartnerPassword(password);
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const digest = await derive(value, salt, PARTNER_PASSWORD_PBKDF2_ITERATIONS);
  return `${PREFIX}$${PARTNER_PASSWORD_HASH_VERSION}$${PARTNER_PASSWORD_PBKDF2_ITERATIONS}$${base64Url(salt)}$${base64Url(digest)}`;
}

export async function verifyPartnerPassword(password: unknown, encodedHash: string) {
  if (typeof password !== "string" || [...password].length > PARTNER_PASSWORD_MAX_LENGTH || encoder.encode(password).byteLength > 4096) {
    return false;
  }
  const parts = encodedHash.split("$");
  if (parts.length !== 5 || parts[0] !== PREFIX || parts[1] !== String(PARTNER_PASSWORD_HASH_VERSION)) return false;
  const iterations = Number(parts[2]);
  if (iterations !== PARTNER_PASSWORD_PBKDF2_ITERATIONS) return false;
  try {
    const salt = fromBase64Url(parts[3]);
    const expected = fromBase64Url(parts[4]);
    if (salt.length !== SALT_BYTES || expected.length !== HASH_BYTES) return false;
    const actual = await derive(password, salt, iterations);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
