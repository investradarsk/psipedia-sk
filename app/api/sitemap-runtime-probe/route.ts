import sitemap from "@/app/sitemap";
import { SitemapStageError } from "@/lib/sitemap-runtime";

function diagnosticCause(error: unknown) {
  if (!error || typeof error !== "object") return { name: typeof error };
  const value = error as { name?: unknown; code?: unknown; message?: unknown };
  const message = typeof value.message === "string" ? value.message : "";
  const sitemapMatch = message.match(/^(sitemap-[a-z-]+):(.+)$/);
  let path: string | null = null;
  if (sitemapMatch?.[2]) {
    try { path = new URL(sitemapMatch[2]).pathname; }
    catch { path = null; }
  }
  return {
    name: typeof value.name === "string" ? value.name : "Error",
    code: sitemapMatch?.[1]
      ?? (typeof value.code === "string" || typeof value.code === "number" ? String(value.code) : null),
    path,
  };
}

export async function GET() {
  try {
    const entries = await sitemap();
    return Response.json({ ok: true, stage: "generator-complete", entries: entries.length });
  } catch (error) {
    if (error instanceof SitemapStageError) {
      return Response.json({
        ok: false,
        stage: error.stage,
        cause: diagnosticCause(error.cause),
      }, { status: 500 });
    }
    return Response.json({
      ok: false,
      stage: "unwrapped",
      cause: diagnosticCause(error),
    }, { status: 500 });
  }
}
