import { env, waitUntil } from "cloudflare:workers";
import { requireAutomationAdminMutation } from "@/lib/admin-automation-api";
import { isAutomationCadenceOption } from "@/lib/admin-automation-presentation";
import { parseAutomationSourceAdminInput } from "@/lib/data-automation-source-admin";
import { parseAutomationGovernanceInput, upsertGovernanceReview } from "@/lib/data-automation-governance";
import { runAutomationSourceNow } from "@/lib/data-automation-runner";
import { productionAutomationHtmlAdapters } from "@/lib/data-automation-real-sources";
import { createProductionOrganizationEnricher } from "@/lib/data-automation-organization-enrichment";
import {
  configureAutomationSource,
  getAutomationSourceAdmin,
  reviewAutomationSource,
  setAutomationSourceEnabled,
  updateAutomationSourceAdmin,
} from "@/lib/data-automation-source-store";
import { prepareAutomationSourceGovernanceForApproval } from "@/lib/data-automation-source-activation";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };
type Bindings = { DB?: D1Database };

function idFrom(value: string) {
  const id = Number.parseInt(value, 10);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function PUT(request: Request, { params }: Props) {
  const auth = await requireAutomationAdminMutation(request);
  if (auth.response || !auth.user) return auth.response!;

  const id = idFrom((await params).id);
  if (!id) return Response.json({ error: "Neplatné ID zdroja." }, { status: 400 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = String(body?.action ?? "");

  try {
    if (action === "configure") {
      const enabled = body?.enabled === true;
      const cadenceMinutes = Number(body?.cadenceMinutes);
      if (!isAutomationCadenceOption(cadenceMinutes)) {
        return Response.json({ error: "Vyber platnú frekvenciu kontroly." }, { status: 400 });
      }
      const bindings = env as unknown as Bindings;
      if (!bindings.DB) return Response.json({ error: "Databáza nie je dostupná." }, { status: 503 });
      const before = await getAutomationSourceAdmin(id, bindings.DB);
      if (!before) return Response.json({ error: "Zdroj sa nenašiel." }, { status: 404 });
      const source = await configureAutomationSource({
        id,
        cadenceMinutes,
        enabled,
        technicalGovernanceRefresh: enabled ? { actor: auth.user.email } : undefined,
      }, bindings.DB);
      const immediateRun = enabled && !before.enabled;
      if (immediateRun) {
        const task = runAutomationSourceNow(id, {
          database: bindings.DB,
          htmlAdapters: productionAutomationHtmlAdapters,
          organizationEnricher: createProductionOrganizationEnricher(),
        }).catch((error) => console.error(JSON.stringify({
          event: "automation_source_immediate_first_run",
          sourceId: id,
          result: "failed",
          error: error instanceof Error ? error.message : String(error),
        })));
        waitUntil(task);
      }
      return Response.json({ source, immediateRun }, { headers: { "cache-control": "no-store" } });
    }

    if (action === "save") {
      const parsed = parseAutomationSourceAdminInput(body?.source);
      if (!parsed.value) return Response.json({ error: parsed.error ?? "Neplatný zdroj." }, { status: 400 });
      const source = await updateAutomationSourceAdmin(id, parsed.value);
      return source ? Response.json({ source }) : Response.json({ error: "Zdroj sa nenašiel." }, { status: 404 });
    }

    if (action === "approve" || action === "reject") {
      const bindings = env as unknown as Bindings;
      if (!bindings.DB) return Response.json({ error: "Databáza nie je dostupná." }, { status: 503 });
      const source = await reviewAutomationSource({
        id,
        action,
        reviewerEmail: auth.user.email,
        notes: typeof body?.notes === "string" ? body.notes : null,
      }, bindings.DB);
      if (source && action === "approve") {
        await prepareAutomationSourceGovernanceForApproval({
          source,
          actor: auth.user.email,
          database: bindings.DB,
        });
      }
      return source ? Response.json({ source }) : Response.json({ error: "Zdroj sa nenašiel." }, { status: 404 });
    }

    if (action === "enable" || action === "disable") {
      const bindings = env as unknown as Bindings;
      if (!bindings.DB) return Response.json({ error: "Databáza nie je dostupná." }, { status: 503 });
      const enabled = action === "enable";
      const source = await setAutomationSourceEnabled({
        id,
        enabled,
        technicalGovernanceRefresh: enabled ? { actor: auth.user.email } : undefined,
      }, bindings.DB);
      return source ? Response.json({ source }) : Response.json({ error: "Zdroj sa nenašiel." }, { status: 404 });
    }

    if (action === "governance") {
      const review = parseAutomationGovernanceInput(body?.governance);
      const governance = await upsertGovernanceReview({
        subject: { type: "AUTOMATION_SOURCE", id },
        review,
        actor: auth.user.email,
      });
      return Response.json({ governance });
    }

    return Response.json({ error: "Neplatná source akcia." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Zdroj sa nepodarilo upraviť.";
    const status = /review_required|not_safe|not_ready|governance_blocked|technical_verification_failed|activation_blocked|stale_update/i.test(message) ? 409 : /cadence_invalid|governance_.*invalid|rationale_required|value_too_long|number_invalid/i.test(message) ? 400 : /unique/i.test(message) ? 409 : 500;
    return Response.json({ error: message }, { status });
  }
}
