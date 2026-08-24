import { env } from "cloudflare:workers";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

type UploadBindings = { BUCKET?: R2Bucket };

const ALLOWED_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
]);
const MAX_FILE_SIZE = 8 * 1024 * 1024;

function detectedImageType(bytes: Uint8Array) {
  const decoder = new TextDecoder();
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte)) return "image/png";
  if (bytes.length >= 12 && decoder.decode(bytes.slice(0, 4)) === "RIFF" && decoder.decode(bytes.slice(8, 12)) === "WEBP") return "image/webp";
  if (bytes.length >= 16 && decoder.decode(bytes.slice(4, 8)) === "ftyp") {
    const brands = decoder.decode(bytes.slice(8, Math.min(bytes.length, 40)));
    if (brands.includes("avif") || brands.includes("avis")) return "image/avif";
  }
  return null;
}

function safeFileName(value: string | null) {
  if (!value) return "obrazok";
  try {
    return decodeURIComponent(value).replace(/[\r\n]/g, "").slice(0, 160) || "obrazok";
  } catch {
    return "obrazok";
  }
}

export async function POST(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();

  const bucket = (env as unknown as UploadBindings).BUCKET;
  if (!bucket) {
    return Response.json({ error: "Úložisko obrázkov zatiaľ nie je pripojené." }, { status: 503 });
  }

  try {
    const declaredLength = Number(request.headers.get("content-length") || "0");
    if (declaredLength > MAX_FILE_SIZE) {
      return Response.json({ error: "Obrázok môže mať najviac 8 MB." }, { status: 413 });
    }

    const requestedFolder = request.headers.get("x-upload-folder");
    const folder = requestedFolder === "events" || requestedFolder === "directory" || requestedFolder === "help" ? requestedFolder : "articles";
    const declaredType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ?? "";
    if (!ALLOWED_TYPES.has(declaredType)) {
      return Response.json({ error: "Použi obrázok JPG, PNG, WebP alebo AVIF." }, { status: 415 });
    }

    const body = await request.arrayBuffer();
    if (!body.byteLength) {
      return Response.json({ error: "Vyber obrázok na nahratie." }, { status: 400 });
    }
    if (body.byteLength > MAX_FILE_SIZE) {
      return Response.json({ error: "Obrázok môže mať najviac 8 MB." }, { status: 413 });
    }
    const actualType = detectedImageType(new Uint8Array(body));
    if (!actualType || actualType !== declaredType) {
      return Response.json({ error: "Obsah súboru nezodpovedá obrázku JPG, PNG, WebP alebo AVIF." }, { status: 415 });
    }

    const extension = ALLOWED_TYPES.get(actualType)!;
    const originalName = safeFileName(request.headers.get("x-file-name"));
    const year = new Date().getUTCFullYear();
    const key = `${folder}/${year}/${crypto.randomUUID()}.${extension}`;
    await bucket.put(key, body, {
      httpMetadata: { contentType: actualType, cacheControl: "public, max-age=31536000, immutable" },
      customMetadata: { uploadedBy: user.email, originalName },
    });

    return Response.json(
      { imageUrl: `/media/${key}`, imageKey: key, filename: originalName, storedBytes: body.byteLength },
      { status: 201 },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Obrázok sa nepodarilo nahrať." },
      { status: 500 },
    );
  }
}
