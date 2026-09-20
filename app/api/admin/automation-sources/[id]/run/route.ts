import { env } from "cloudflare:workers";
import { requireAutomationAdminMutation } from "@/lib/admin-automation-api";
import { runAutomationSourceNow } from "@/lib/data-automation-runner";
import { productionAutomationHtmlAdapters } from "@/lib/data-automation-real-sources";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };
type RuntimeBindings = { DB?: D1Database };

export async function POST(request: Request, { params }: Props) {
  const auth = await requireAutomationAdminMutation(request);
  if (auth.response) return auth.response;

  const id = Number.parseInt((await params).id, 10);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Neplatné ID zdroja." }, { status: 400 });
  const db = (env as unknown as RuntimeBindings).DB;
  if (!db) return Response.json({ error: "Databáza nie je dostupná." }, { status: 503 });

  try {
    const run = await runAutomationSourceNow(id, {
      database: db,
      htmlAdapters: productionAutomationHtmlAdapters,
    });
    return Response.json({
      run,
      safety: { canonicalWrite: false, publication: false },
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kontrolu sa nepodarilo spustiť.";
    const status = /not_found/.test(message) ? 404 : /disabled/.test(message) ? 409 : 500;
    return Response.json({ error: message }, { status });
  }
}
