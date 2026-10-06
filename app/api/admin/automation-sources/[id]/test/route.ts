import { env } from "cloudflare:workers";
import { requireAutomationAdminMutation } from "@/lib/admin-automation-api";
import { previewAutomationSource } from "@/lib/data-automation-preview";
import { automationSourceActivationReadiness } from "@/lib/data-automation-source-activation";
import {
  getAutomationSourceAdmin,
  sourceAdminRowToRuntimeSource,
} from "@/lib/data-automation-source-store";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };
type RuntimeBindings = { DB?: D1Database; TAVILY_API_KEY?: string };

export async function POST(request: Request, { params }: Props) {
  const auth = await requireAutomationAdminMutation(request);
  if (auth.response) return auth.response;

  const id = Number.parseInt((await params).id, 10);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Neplatné ID zdroja." }, { status: 400 });

  const source = await getAutomationSourceAdmin(id);
  if (!source) return Response.json({ error: "Zdroj sa nenašiel." }, { status: 404 });

  const db = (env as unknown as RuntimeBindings).DB;
  if (!db) return Response.json({ error: "Databáza nie je dostupná." }, { status: 503 });

  const tavilyCredentialConfigured = Boolean((env as unknown as RuntimeBindings).TAVILY_API_KEY?.trim());
  const readiness = await automationSourceActivationReadiness(source, db, {
    tavilyCredentialConfigured,
  });
  if (!readiness.ready) {
    return Response.json({
      error: "Zdroj zatiaľ nie je pripravený na automatické spracovanie.",
      readiness,
    }, { status: 409, headers: { "cache-control": "no-store" } });
  }

  const preview = await previewAutomationSource({
    source: sourceAdminRowToRuntimeSource(source),
    database: db,
    tavilyApiKey: (env as unknown as RuntimeBindings).TAVILY_API_KEY,
  });
  return Response.json({ preview }, { headers: { "cache-control": "no-store" } });
}
