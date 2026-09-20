export type WebPushSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type VapidConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

export type WebPushPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
};

const encoder = new TextEncoder();

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function jsonToBase64Url(value: unknown) {
  return bytesToBase64Url(encoder.encode(JSON.stringify(value)));
}

function concatBytes(...parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

function vapidJwk(publicKey: Uint8Array, privateKey: Uint8Array): JsonWebKey {
  if (publicKey.byteLength !== 65 || publicKey[0] !== 4 || privateKey.byteLength !== 32) {
    throw new Error("Neplatný VAPID P-256 key material.");
  }
  return {
    kty: "EC",
    crv: "P-256",
    x: bytesToBase64Url(publicKey.slice(1, 33)),
    y: bytesToBase64Url(publicKey.slice(33, 65)),
    d: bytesToBase64Url(privateKey),
    ext: true,
  };
}

async function createVapidAuthorization(endpoint: string, config: VapidConfig, now = new Date()) {
  const publicKey = base64UrlToBytes(config.publicKey);
  const privateKey = base64UrlToBytes(config.privateKey);
  const endpointUrl = new URL(endpoint);
  const audience = endpointUrl.origin;
  const expiration = Math.floor(now.getTime() / 1000) + 12 * 60 * 60;
  const unsigned = `${jsonToBase64Url({ typ: "JWT", alg: "ES256" })}.${jsonToBase64Url({
    aud: audience,
    exp: expiration,
    sub: config.subject,
  })}`;
  const signingKey = await crypto.subtle.importKey(
    "jwk",
    vapidJwk(publicKey, privateKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    signingKey,
    encoder.encode(unsigned),
  ));
  return `vapid t=${unsigned}.${bytesToBase64Url(signature)}, k=${config.publicKey}`;
}

async function encryptPayload(subscription: WebPushSubscription, payload: Uint8Array) {
  if (payload.byteLength > 3000) throw new Error("Push payload je príliš veľký.");

  const recipientPublic = base64UrlToBytes(subscription.p256dh);
  const authSecret = base64UrlToBytes(subscription.auth);
  if (recipientPublic.byteLength !== 65 || recipientPublic[0] !== 4 || authSecret.byteLength < 16) {
    throw new Error("Neplatný Web Push subscription key material.");
  }

  const senderKeys = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const senderPublic = new Uint8Array(await crypto.subtle.exportKey("raw", senderKeys.publicKey));
  const recipientKey = await crypto.subtle.importKey(
    "raw",
    recipientPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "ECDH", public: recipientKey },
    senderKeys.privateKey,
    256,
  ));

  const keyInfo = concatBytes(
    encoder.encode("WebPush: info\0"),
    recipientPublic,
    senderPublic,
  );
  const ikm = await hkdf(sharedSecret, authSecret, keyInfo, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(ikm, salt, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(ikm, salt, encoder.encode("Content-Encoding: nonce\0"), 12);

  const plaintext = concatBytes(payload, new Uint8Array([2]));
  const contentKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, tagLength: 128 },
    contentKey,
    plaintext,
  ));

  const recordSize = 4096;
  const header = new Uint8Array(16 + 4 + 1 + senderPublic.byteLength);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, recordSize, false);
  header[20] = senderPublic.byteLength;
  header.set(senderPublic, 21);
  return concatBytes(header, encrypted);
}

export function normalizeAdminNotificationPath(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) return "/admin/operations";
  const url = new URL(value, "https://psipedia.sk");
  if (url.origin !== "https://psipedia.sk") return "/admin/operations";
  if (url.pathname !== "/admin" && !url.pathname.startsWith("/admin/")) return "/admin/operations";
  return `${url.pathname}${url.search}${url.hash}`;
}

export async function sendWebPush(
  subscription: WebPushSubscription,
  payload: WebPushPayload,
  config: VapidConfig,
  options: { fetchImpl?: typeof fetch; now?: Date; ttlSeconds?: number } = {},
) {
  const endpoint = new URL(subscription.endpoint);
  if (endpoint.protocol !== "https:") throw new Error("Web Push endpoint musí používať HTTPS.");
  if (!config.subject.startsWith("mailto:") && !config.subject.startsWith("https://")) {
    throw new Error("VAPID subject musí byť mailto: alebo HTTPS URL.");
  }

  const safePayload = {
    title: payload.title.slice(0, 90),
    body: payload.body.slice(0, 180),
    url: normalizeAdminNotificationPath(payload.url),
    tag: payload.tag?.slice(0, 80),
  };
  const encrypted = await encryptPayload(subscription, encoder.encode(JSON.stringify(safePayload)));
  const authorization = await createVapidAuthorization(subscription.endpoint, config, options.now);
  const response = await (options.fetchImpl ?? fetch)(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(Math.max(0, Math.min(options.ttlSeconds ?? 300, 86_400))),
      Urgency: "normal",
    },
    body: encrypted,
  });
  return {
    ok: response.ok,
    status: response.status,
    expired: response.status === 404 || response.status === 410,
    retryable: response.status === 408 || response.status === 429 || response.status >= 500,
  };
}
