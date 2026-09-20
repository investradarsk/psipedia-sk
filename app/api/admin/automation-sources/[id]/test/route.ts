import { env } from "cloudflare:workers";
import { requireAutomationAdminMutation } from "@/lib/admin-automation-api";
import { previewAutomationSource } from "@/lib/data-automation-preview";
import {
  getAutomationSourceAdmin,
  sourceAdminRowToRuntimeSource,
} from "@/lib/data-automation-source-store";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };
type RuntimeBindings = { DB?: D1Database };

export async function POST(request: Request, { params }: Props) {
  const auth = await requireAutomationAdminMutation(request);
  if (auth.response) return auth.response;

  const id = Number.parseInt((await params).id, 10);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Neplatné ID zdroja." }, { status: 400 });

  const source = await getAutomationSourceAdmin(id);
  if (!source) return Response.json({ error: "Zdroj sa nenašiel." }, { status: 404 });
  const db = (env as unknown as RuntimeBindings).DB;
  if (!db) return Response.json({ error: "Databáza nie je dostupná." }, { status: 503 });

  const preview = await previewAutomationSource({
    source: sourceAdminRowToRuntimeSource(source),
    database: db,
  });
  return Response.json({ preview }, { headers: { "cache-control": "no-store" } });
}
