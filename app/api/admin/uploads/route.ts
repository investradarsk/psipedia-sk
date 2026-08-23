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

export async function POST(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();

  const bucket = (env as unknown as UploadBindings).BUCKET;
  if (!bucket) {
    return Response.json({ error: "Úložisko obrázkov zatiaľ nie je pripojené." }, { status: 503 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const requestedFolder = formData.get("folder");
    const folder = requestedFolder === "events" || requestedFolder === "directory" || requestedFolder === "help" ? requestedFolder : "articles";
    if (!(file instanceof File)) {
      return Response.json({ error: "Vyber obrázok na nahratie." }, { status: 400 });
    }
    const extension = ALLOWED_TYPES.get(file.type);
    if (!extension) {
      return Response.json({ error: "Použi obrázok JPG, PNG, WebP alebo AVIF." }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return Response.json({ error: "Obrázok môže mať najviac 8 MB." }, { status: 400 });
    }

    const year = new Date().getUTCFullYear();
    const key = `${folder}/${year}/${crypto.randomUUID()}.${extension}`;
    await bucket.put(key, file.stream(), {
      httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" },
      customMetadata: { uploadedBy: user.email, originalName: file.name.slice(0, 160) },
    });

    return Response.json(
      { imageUrl: `/media/${key}`, imageKey: key, filename: file.name },
      { status: 201 },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Obrázok sa nepodarilo nahrať." },
      { status: 500 },
    );
  }
}
