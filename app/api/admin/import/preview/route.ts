import { env } from "cloudflare:workers";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { buildGeneralImportPlan } from "@/lib/admin-import-plan";

export const dynamic = "force-dynamic";

type RuntimeBindings = { DB?: D1Database };
const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

export async function POST(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_IMPORT_BYTES) {
    return Response.json({ error: "Import je príliš veľký." }, { status: 413 });
  }

  const database = (env as RuntimeBindings).DB;
  if (!database) return Response.json({ error: "Databáza D1 nie je pripojená." }, { status: 503 });

  try {
    const plan = await buildGeneralImportPlan(database, await request.json());
    return Response.json({ success: plan.preview.totals.rejected === 0, preview: plan.preview });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Preview importu sa nepodaril." },
      { status: 400 },
    );
  }
}
