import { env } from "cloudflare:workers";
import { requireAutomationAdminMutation } from "@/lib/admin-automation-api";
import {
  getAutomationDiscoveryRoot,
  reviewAutomationDiscoveryRoot,
  setAutomationDiscoveryRootEnabled,
} from "@/lib/data-automation-discovery-store";
import { runAutomationDiscoveryRootCanary } from "@/lib/data-automation-discovery-runner";
import { getGovernanceState, upsertGovernanceReview } from "@/lib/data-automation-governance";
import { TavilyAutomationSearchProvider } from "@/lib/data-automation-search-tavily";
import {
  isTavilySearchDiscoveryRoot,
  tavilyCanaryReadiness,
  tavilySearchGovernancePresetForRoot,
} from "@/lib/tavily-canary-control";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };
type Bindings = { DB?: D1Database; TAVILY_API_KEY?: string };

function idFrom(value: string) {
  const id = Number.parseInt(value, 10);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function responseStatus(message: string) {
  if (/not_found/i.test(message)) return 404;
  if (/review_required|governance_blocked|disabled|not_due|ROOT_|SECRET_|GOVERNANCE_/i.test(message)) return 409;
  if (/invalid|stale_update/i.test(message)) return 400;
  return 500;
}

async function requireTavilyRoot(id: number) {
  const root = await getAutomationDiscoveryRoot(id);
  if (!root || !isTavilySearchDiscoveryRoot(root)) {
    throw new Error("automation_discovery_root_not_found");
  }
  return root;
}

export async function PUT(request: Request, { params }: Props) {
  const auth = await requireAutomationAdminMutation(request);
  if (auth.response || !auth.user) return auth.response!;

  const id = idFrom((await params).id);
  if (!id) return Response.json({ error: "Neplatné ID discovery rootu." }, { status: 400 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = String(body?.action ?? "");

  try {
    const root = await requireTavilyRoot(id);

    if (action === "governance-approve") {
      const governanceRead = await getGovernanceState({ type: "DISCOVERY_ROOT", id });
      const governancePreset = tavilySearchGovernancePresetForRoot(root);
      const governance = await upsertGovernanceReview({
        subject: { type: "DISCOVERY_ROOT", id },
        review: {
          ...governancePreset,
          expectedUpdatedAt: governanceRead.state?.updatedAt ?? null,
        },
        actor: auth.user.email,
      });
      return Response.json({ governance });
    }

    if (action === "approve-root") {
      const updated = await reviewAutomationDiscoveryRoot({
        id,
        action: "approve",
        reviewerEmail: auth.user.email,
        notes: "Tavily discovery root technical operator approval.",
      });
      return Response.json({ root: updated });
    }

    if (action === "enable") {
      const updated = await setAutomationDiscoveryRootEnabled({ id, enabled: true });
      return Response.json({ root: updated });
    }

    if (action === "disable") {
      const updated = await setAutomationDiscoveryRootEnabled({ id, enabled: false });
      return Response.json({ root: updated });
    }

    if (action === "canary") {
      const bindings = env as unknown as Bindings;
      if (!bindings.DB) throw new Error("automation_discovery_database_unavailable");
      const provider = new TavilyAutomationSearchProvider({ apiKey: bindings.TAVILY_API_KEY });
      const governance = await getGovernanceState({ type: "DISCOVERY_ROOT", id }, bindings.DB);
      const readiness = tavilyCanaryReadiness({
        root,
        governance,
        secretConfigured: provider.credentialConfigured,
      });
      if (!readiness.allowed) {
        throw new Error("automation_discovery_canary_blocked:" + readiness.blockers.join(","));
      }
      const run = await runAutomationDiscoveryRootCanary({
        rootId: id,
        options: {
          database: bindings.DB,
          searchProvider: provider,
        },
      });
      return Response.json({ run });
    }

    return Response.json({ error: "Neplatná discovery root akcia." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Discovery root operácia zlyhala.";
    return Response.json({ error: message }, { status: responseStatus(message) });
  }
}
