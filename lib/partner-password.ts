import { scrypt, timingSafeEqual } from "node:crypto";

const encoder = new TextEncoder();

export const PARTNER_PASSWORD_MIN_LENGTH = 12;
export const PARTNER_PASSWORD_MAX_LENGTH = 1024;
export const PARTNER_PASSWORD_HASH_VERSION = 1;
export const PARTNER_PASSWORD_SCRYPT_N = 1 << 14;
export const PARTNER_PASSWORD_SCRYPT_R = 8;
export const PARTNER_PASSWORD_SCRYPT_P = 5;
const PARTNER_PASSWORD_SCRYPT_MAXMEM = 32 * 1024 * 1024;
const SALT_BYTES = 16;
const HASH_BYTES = 32;
const PREFIX = "scrypt";
export const PARTNER_DUMMY_PASSWORD_HASH =
  "scrypt$1$16384$8$5$ABEiM0RVZneImaq7zN3u_w$_pjo_C7t8XQPGmFnBWLYvHi-Zxqcsr7LwhHxFcJfRKE";

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

function derive(password: string, salt: Uint8Array) {
  return new Promise<Uint8Array>((resolve, reject) => {
    scrypt(
      password,
      salt,
      HASH_BYTES,
      {
        N: PARTNER_PASSWORD_SCRYPT_N,
        r: PARTNER_PASSWORD_SCRYPT_R,
        p: PARTNER_PASSWORD_SCRYPT_P,
        maxmem: PARTNER_PASSWORD_SCRYPT_MAXMEM,
      },
      (error, key) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(new Uint8Array(key));
      },
    );
  });
}

export async function hashPartnerPassword(password: unknown) {
  const value = validatePartnerPassword(password);
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const digest = await derive(value, salt);
  return [
    PREFIX,
    PARTNER_PASSWORD_HASH_VERSION,
    PARTNER_PASSWORD_SCRYPT_N,
    PARTNER_PASSWORD_SCRYPT_R,
    PARTNER_PASSWORD_SCRYPT_P,
    base64Url(salt),
    base64Url(digest),
  ].join("$");
}

export async function verifyPartnerPassword(password: unknown, encodedHash: string) {
  if (
    typeof password !== "string"
    || [...password].length > PARTNER_PASSWORD_MAX_LENGTH
    || encoder.encode(password).byteLength > 4096
  ) {
    return false;
  }
  const parts = encodedHash.split("$");
  if (
    parts.length !== 7
    || parts[0] !== PREFIX
    || parts[1] !== String(PARTNER_PASSWORD_HASH_VERSION)
    || Number(parts[2]) !== PARTNER_PASSWORD_SCRYPT_N
    || Number(parts[3]) !== PARTNER_PASSWORD_SCRYPT_R
    || Number(parts[4]) !== PARTNER_PASSWORD_SCRYPT_P
  ) {
    return false;
  }
  try {
    const salt = fromBase64Url(parts[5]);
    const expected = fromBase64Url(parts[6]);
    if (salt.length !== SALT_BYTES || expected.length !== HASH_BYTES) return false;
    const actual = await derive(password, salt);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
