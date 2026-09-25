export const MAX_PRIVATE_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_PRIVATE_IMAGE_SIDE = 12_000;
export const MAX_PRIVATE_IMAGE_PIXELS = 50_000_000;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

type ImageTransformationResultLike = { response(): Response | Promise<Response> };
export type ImagesBindingLike = { input(stream: ReadableStream<Uint8Array>): { transform(options: Record<string, unknown>): { output(options: Record<string, unknown>): Promise<ImageTransformationResultLike> } } };
export type R2ObjectLike = { body: ReadableStream<Uint8Array>; arrayBuffer(): Promise<ArrayBuffer>; httpEtag?: string; writeHttpMetadata?(headers: Headers): void };
export type PrivateBucketLike = {
  put(key: string, value: ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>, options?: Record<string, unknown>): Promise<unknown>;
  get(key: string): Promise<R2ObjectLike | null>;
  delete(key: string): Promise<void>;
};
export type PublicBucketLike = { put(key: string, value: ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>, options?: Record<string, unknown>): Promise<unknown> };

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  return signature.every((value, index) => bytes[offset + index] === value);
}
function u16be(bytes: Uint8Array, offset: number) { return (bytes[offset] << 8) | bytes[offset + 1]; }
function u16le(bytes: Uint8Array, offset: number) { return bytes[offset] | (bytes[offset + 1] << 8); }
function u24le(bytes: Uint8Array, offset: number) { return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16); }
function u32be(bytes: Uint8Array, offset: number) {
  return ((bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
}
function ascii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

export function detectImageMime(bytes: Uint8Array) {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  return null;
}

export function imageDimensions(bytes: Uint8Array, mime = detectImageMime(bytes)) {
  if (mime === "image/png") {
    if (bytes.length < 24 || ascii(bytes, 12, 4) !== "IHDR") return null;
    return { width: u32be(bytes, 16), height: u32be(bytes, 20) };
  }
  if (mime === "image/jpeg") {
    let offset = 2;
    const sof = new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
      const marker = bytes[offset++];
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) return null;
      const length = u16be(bytes, offset);
      if (length < 2 || offset + length > bytes.length) return null;
      if (sof.has(marker)) {
        if (length < 7) return null;
        return { height: u16be(bytes, offset + 3), width: u16be(bytes, offset + 5) };
      }
      offset += length;
    }
    return null;
  }
  if (mime === "image/webp") {
    if (bytes.length < 25) return null;
    const chunk = ascii(bytes, 12, 4);
    if (chunk === "VP8X" && bytes.length >= 30) return { width: 1 + u24le(bytes, 24), height: 1 + u24le(bytes, 27) };
    if (chunk === "VP8 " && bytes.length >= 30 && startsWith(bytes, [0x9d,0x01,0x2a], 23)) {
      return { width: u16le(bytes, 26) & 0x3fff, height: u16le(bytes, 28) & 0x3fff };
    }
    if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
      const b1=bytes[21],b2=bytes[22],b3=bytes[23],b4=bytes[24];
      return { width: 1 + (((b2 & 0x3f) << 8) | b1), height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)) };
    }
  }
  return null;
}

export function validateImageDimensions(dimensions: { width: number; height: number } | null) {
  if (!dimensions || !Number.isSafeInteger(dimensions.width) || !Number.isSafeInteger(dimensions.height) || dimensions.width < 1 || dimensions.height < 1) {
    throw new Error("Image dimensions are invalid");
  }
  if (dimensions.width > MAX_PRIVATE_IMAGE_SIDE || dimensions.height > MAX_PRIVATE_IMAGE_SIDE
    || dimensions.width * dimensions.height > MAX_PRIVATE_IMAGE_PIXELS) {
    throw new Error("Image dimensions exceed safe limits");
  }
  return dimensions;
}

function randomSuffix(byteLength = 16) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function sha256(bytes: Uint8Array) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function ingestPrivateImage(input: {
  bytes: Uint8Array;
  declaredMime: string;
  ownerType: string;
  ownerId: string;
  assetId?: string;
  privateBucket: PrivateBucketLike;
  images: ImagesBindingLike;
}) {
  if (!ALLOWED_MIME.has(input.declaredMime)) throw new Error("Unsupported image format");
  if (!input.bytes.byteLength || input.bytes.byteLength > MAX_PRIVATE_IMAGE_BYTES) throw new Error("Image exceeds size limit");
  const detectedMime = detectImageMime(input.bytes);
  if (!detectedMime || detectedMime !== input.declaredMime) throw new Error("Image MIME mismatch");
  const dimensions = validateImageDimensions(imageDimensions(input.bytes, detectedMime));

  const assetId = input.assetId ?? crypto.randomUUID();
  const rawKey = `quarantine/${input.ownerType}/${input.ownerId}/${assetId}-${randomSuffix()}`;
  const safeKey = `safe/${input.ownerType}/${input.ownerId}/${assetId}.webp`;
  await input.privateBucket.put(rawKey, input.bytes, {
    httpMetadata: { contentType: detectedMime },
    customMetadata: { visibility: "private-quarantine" },
  });

  let stage = "transform-output";
  try {
    const source = new Blob([input.bytes.slice().buffer], { type: detectedMime }).stream();
    const transformed = await input.images.input(source)
      .transform({ width: 2000, height: 2000, fit: "scale-down", metadata: "none" })
      .output({ format: "image/webp", quality: 85, anim: false });
    stage = "response";
    const response = await transformed.response();
    if (!response.ok) throw new Error("Image transformation failed");
    stage = "read-output";
    const safeBytes = new Uint8Array(await response.arrayBuffer());
    if (!safeBytes.byteLength || safeBytes.byteLength > MAX_PRIVATE_IMAGE_BYTES) throw new Error("Processed image is invalid");
    stage = "safe-write";
    await input.privateBucket.put(safeKey, safeBytes, {
      httpMetadata: { contentType: "image/webp" },
      customMetadata: { visibility: "private-safe", metadataStripped: "true" },
    });
    return {
      assetId, rawKey, safeKey, originalMime: detectedMime, safeMime: "image/webp",
      sizeBytes: input.bytes.byteLength, safeSizeBytes: safeBytes.byteLength,
      width: dimensions.width, height: dimensions.height, sha256: await sha256(input.bytes),
    };
  } catch (error) {
    console.error("[private-media] image pipeline failure", {
      stage,
      errorClass: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : "Unknown image pipeline failure",
    });
    await input.privateBucket.delete(rawKey).catch(() => undefined);
    await input.privateBucket.delete(safeKey).catch(() => undefined);
    throw error;
  }
}

export async function publishSafeImage(input: { safeKey: string; publicKey: string; privateBucket: PrivateBucketLike; publicBucket: PublicBucketLike }) {
  if (!input.safeKey.startsWith("safe/")) throw new Error("Only SAFE assets can be published");
  const safeObject = await input.privateBucket.get(input.safeKey);
  if (!safeObject) throw new Error("SAFE asset not found");
  await input.publicBucket.put(input.publicKey, safeObject.body, {
    httpMetadata: { contentType: "image/webp", cacheControl: "public, max-age=31536000, immutable" },
  });
  return input.publicKey;
}
