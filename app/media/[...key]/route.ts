import { env } from "cloudflare:workers";
import { RESPONSIVE_MEDIA_WIDTHS } from "@/lib/responsive-media";

export const dynamic = "force-dynamic";

type ImageTransformer = {
  input(stream: ReadableStream): {
    transform(options: { width: number }): {
      output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
    };
  };
};
type MediaBindings = { BUCKET?: R2Bucket; IMAGES?: ImageTransformer };
type RouteProps = { params: Promise<{ key: string[] }> };
const MEDIA_CACHE_CONTROL = "public, max-age=31536000, immutable";

export async function GET(request: Request, { params }: RouteProps) {
  const { key: segments } = await params;
  if (!segments?.length || segments.some((segment) => !segment || segment === "." || segment === "..")) {
    return new Response("Not found", { status: 404 });
  }

  if (segments[0] === "quarantine" || segments[0] === "safe") {
    return new Response("Not found", { status: 404 });
  }

  const bindings = env as unknown as MediaBindings;
  const bucket = bindings.BUCKET;
  if (!bucket) return new Response("Not found", { status: 404 });

  const key = segments.join("/");
  let object = await bucket.get(key);
  if (!object) return new Response("Not found", { status: 404 });

  // Only known finite widths and raster images can opt into transformations.
  // Canonical /media/<key> URLs always return the original R2 object.
  const requestedWidth = new URL(request.url).searchParams.get("w");
  const width = requestedWidth && /^\d+$/.test(requestedWidth) ? Number(requestedWidth) : 0;
  const raster = /\.(?:jpe?g|png|webp|avif)$/i.test(key);
  if (raster && RESPONSIVE_MEDIA_WIDTHS.some((allowed) => allowed === width) && bindings.IMAGES) {
    try {
      const optimized = await bindings.IMAGES
        .input(object.body)
        .transform({ width })
        .output({ format: "image/webp", quality: 76 });
      const result = optimized.response();
      if (!result.ok) throw new Error("Image transformation returned an error");
      const headers = new Headers(result.headers);
      headers.set("content-type", "image/webp");
      headers.set("cache-control", MEDIA_CACHE_CONTROL);
      headers.set("x-content-type-options", "nosniff");
      headers.delete("etag"); // The R2 source ETag does not identify the transformed bytes.
      return new Response(result.body, { status: result.status, headers });
    } catch (error) {
      console.error("responsive_media_transform_failed", error);
      // The transform may have consumed the source stream. A failed variant
      // should still display the original, never a broken image.
      object = await bucket.get(key);
      if (!object) return new Response("Not found", { status: 404 });
    }
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", MEDIA_CACHE_CONTROL);
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}
