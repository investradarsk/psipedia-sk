import sitemap from "@/app/sitemap";
import { SitemapStageError } from "@/lib/sitemap-runtime";

function diagnosticCause(error: unknown) {
  if (!error || typeof error !== "object") return { name: typeof error };
  const value = error as { name?: unknown; code?: unknown };
  return {
    name: typeof value.name === "string" ? value.name : "Error",
    code: typeof value.code === "string" || typeof value.code === "number" ? String(value.code) : null,
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
