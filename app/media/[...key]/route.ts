import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

type MediaBindings = { BUCKET?: R2Bucket };
type RouteProps = { params: Promise<{ key: string[] }> };

export async function GET(_request: Request, { params }: RouteProps) {
  const { key: segments } = await params;
  if (!segments?.length || segments.some((segment) => !segment || segment === "." || segment === "..")) {
    return new Response("Not found", { status: 404 });
  }

  const bucket = (env as unknown as MediaBindings).BUCKET;
  if (!bucket) return new Response("Not found", { status: 404 });
  const object = await bucket.get(segments.join("/"));
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}
