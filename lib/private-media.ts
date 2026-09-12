const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

type ImageOutput = { response(): Promise<Response> };
type ImageTransformer = { transform(options: Record<string, unknown>): ImageTransformer; output(options: Record<string, unknown>): ImageOutput };
type ImagesBindingLike = { input(stream: ReadableStream<Uint8Array>): ImageTransformer };
type R2ObjectLike = { body: ReadableStream<Uint8Array>; arrayBuffer(): Promise<ArrayBuffer>; httpEtag?: string };
type PrivateBucketLike = { put(key: string, value: ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>, options?: Record<string, unknown>): Promise<unknown>; get(key: string): Promise<R2ObjectLike | null>; delete(key: string): Promise<void> };
type PublicBucketLike = { put(key: string, value: ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>, options?: Record<string, unknown>): Promise<unknown> };

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

function randomSuffix(byteLength = 16) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function detectImageMime(bytes: Uint8Array) {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (bytes.length >= 12 && startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
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
  privateBucket: PrivateBucketLike;
  images: ImagesBindingLike;
}) {
  if (!ALLOWED_MIME.has(input.declaredMime)) throw new Error("Unsupported image format");
  if (!input.bytes.byteLength || input.bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("Image exceeds size limit");
  const detectedMime = detectImageMime(input.bytes);
  if (!detectedMime || detectedMime !== input.declaredMime) throw new Error("Image MIME mismatch");

  const assetId = crypto.randomUUID();
  const rawKey = `quarantine/${input.ownerType}/${input.ownerId}/${assetId}-${randomSuffix()}`;
  const safeKey = `safe/${input.ownerType}/${input.ownerId}/${assetId}.webp`;
  await input.privateBucket.put(rawKey, input.bytes, { httpMetadata: { contentType: detectedMime }, customMetadata: { visibility: "private-quarantine" } });

  try {
    const source = new Blob([input.bytes.slice().buffer], { type: detectedMime }).stream();
    const transformed = input.images.input(source)
      .transform({ width: 2000, height: 2000, fit: "scale-down" })
      .output({ format: "image/webp", quality: 85, metadata: "none" });
    const response = await transformed.response();
    if (!response.ok) throw new Error("Image transformation failed");
    const safeBytes = new Uint8Array(await response.arrayBuffer());
    if (!safeBytes.byteLength || safeBytes.byteLength > MAX_IMAGE_BYTES) throw new Error("Processed image is invalid");
    await input.privateBucket.put(safeKey, safeBytes, { httpMetadata: { contentType: "image/webp" }, customMetadata: { visibility: "private-safe", metadataStripped: "true" } });
    return { assetId, rawKey, safeKey, originalMime: detectedMime, safeMime: "image/webp", sizeBytes: input.bytes.byteLength, safeSizeBytes: safeBytes.byteLength, sha256: await sha256(input.bytes) };
  } catch (error) {
    await input.privateBucket.delete(rawKey).catch(() => undefined);
    throw error;
  }
}

export async function publishSafeImage(input: { safeKey: string; publicKey: string; privateBucket: PrivateBucketLike; publicBucket: PublicBucketLike }) {
  if (!input.safeKey.startsWith("safe/")) throw new Error("Only SAFE assets can be published");
  const safeObject = await input.privateBucket.get(input.safeKey);
  if (!safeObject) throw new Error("SAFE asset not found");
  await input.publicBucket.put(input.publicKey, safeObject.body, { httpMetadata: { contentType: "image/webp", cacheControl: "public, max-age=31536000, immutable" } });
  return input.publicKey;
}
