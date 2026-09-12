const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function decodeKey(secret: string, expectedBytes: number, label: string) {
  const bytes = fromBase64Url(secret.trim());
  if (bytes.byteLength !== expectedBytes) throw new Error(`${label} must be ${expectedBytes} random bytes encoded as base64url`);
  return bytes;
}

export async function encryptPii(plaintext: string, encryptionKey: string) {
  if (!plaintext) return "";
  const key = await crypto.subtle.importKey("raw", decodeKey(encryptionKey, 32, "PII_ENCRYPTION_KEY"), "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(plaintext));
  return `v1.${base64Url(iv)}.${base64Url(new Uint8Array(ciphertext))}`;
}

export async function decryptPii(ciphertext: string, encryptionKey: string) {
  if (!ciphertext) return "";
  const [version, ivValue, payloadValue, ...extra] = ciphertext.split(".");
  if (version !== "v1" || !ivValue || !payloadValue || extra.length) throw new Error("Unsupported PII ciphertext format");
  const key = await crypto.subtle.importKey("raw", decodeKey(encryptionKey, 32, "PII_ENCRYPTION_KEY"), "AES-GCM", false, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64Url(ivValue) }, key, fromBase64Url(payloadValue));
  return decoder.decode(plaintext);
}

export async function hashPii(normalizedValue: string, hashKey: string) {
  const key = await crypto.subtle.importKey("raw", decodeKey(hashKey, 32, "PII_HASH_KEY"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(normalizedValue));
  return base64Url(new Uint8Array(signature));
}

export function normalizeEmail(value: string) {
  return value.normalize("NFKC").trim().toLowerCase();
}

export function normalizePhone(value: string) {
  const compact = value.replace(/[^\d+]/g, "");
  if (/^09\d{8}$/.test(compact)) return `+421${compact.slice(1)}`;
  if (/^00421\d{9}$/.test(compact)) return `+${compact.slice(2)}`;
  if (/^\+421\d{9}$/.test(compact)) return compact;
  if (/^\+[1-9]\d{7,14}$/.test(compact)) return compact;
  throw new Error("Invalid phone number");
}
