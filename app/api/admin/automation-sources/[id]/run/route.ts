import { env, waitUntil } from "cloudflare:workers";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { requireAutomationAdminMutation } from "@/lib/admin-automation-api";
import { runAutomationSourceNow } from "@/lib/data-automation-runner";
import { productionAutomationHtmlAdapters } from "@/lib/data-automation-real-sources";
import { createProductionOrganizationEnricher } from "@/lib/data-automation-organization-enrichment";
import { getAutomationSourceAdmin } from "@/lib/data-automation-source-store";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };
type RuntimeBindings = { DB?: D1Database };

function runPayload(source: Awaited<ReturnType<typeof getAutomationSourceAdmin>>) {
  if (!source) return null;
  return {
    sourceId: source.id,
    status: source.lastRunStatus,
    checked: source.checkedCount,
    newFindings: source.newFindingCount,
    updatedFindings: source.updatedFindingCount,
    errors: source.errorCount,
    durationMs: source.durationMs,
    nextCheckAt: source.nextCheckAt,
    lastCheckedAt: source.lastCheckedAt,
    lastErrorCode: source.lastErrorCode,
  };
}

export async function GET(_request: Request, { params }: Props) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();

  const id = Number.parseInt((await params).id, 10);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Neplatné ID zdroja." }, { status: 400 });
  const db = (env as unknown as RuntimeBindings).DB;
  if (!db) return Response.json({ error: "Databáza nie je dostupná." }, { status: 503 });

  const source = await getAutomationSourceAdmin(id, db);
  if (!source) return Response.json({ error: "Zdroj neexistuje." }, { status: 404 });
  return Response.json({ run: runPayload(source) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request, { params }: Props) {
  const auth = await requireAutomationAdminMutation(request);
  if (auth.response) return auth.response;

  const id = Number.parseInt((await params).id, 10);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Neplatné ID zdroja." }, { status: 400 });
  const db = (env as unknown as RuntimeBindings).DB;
  if (!db) return Response.json({ error: "Databáza nie je dostupná." }, { status: 503 });

  const source = await getAutomationSourceAdmin(id, db);
  if (!source) return Response.json({ error: "Zdroj neexistuje." }, { status: 404 });
  if (!source.enabled) return Response.json({ error: "automation_source_disabled" }, { status: 409 });
  if (source.reviewStatus !== "APPROVED") return Response.json({ error: "automation_source_review_required" }, { status: 409 });

  if (source.lastRunStatus === "RUNNING") {
    return Response.json({
      accepted: true,
      alreadyRunning: true,
      run: runPayload(source),
      safety: { canonicalWrite: false, publication: false },
    }, { status: 202, headers: { "cache-control": "no-store" } });
  }

  const task = runAutomationSourceNow(id, {
    database: db,
    htmlAdapters: productionAutomationHtmlAdapters,
    organizationEnricher: createProductionOrganizationEnricher(),
  }).catch((error) => {
    console.error(JSON.stringify({
      event: "automation_manual_background_run",
      sourceId: id,
      result: "failed",
      error: error instanceof Error ? error.message : String(error),
    }));
  });
  waitUntil(task);

  return Response.json({
    accepted: true,
    alreadyRunning: false,
    run: { sourceId: id, status: "RUNNING" },
    safety: { canonicalWrite: false, publication: false },
  }, { status: 202, headers: { "cache-control": "no-store" } });
}
