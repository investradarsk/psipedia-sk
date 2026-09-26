import { env } from "cloudflare:workers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { AdminTavilyRootDetail } from "@/components/admin-tavily-root-detail";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { automationCategoryBySlug } from "@/lib/admin-automation-presentation";
import {
  getAutomationDiscoveryRoot,
  listAutomationDiscoveryRuns,
} from "@/lib/data-automation-discovery-store";
import { getGovernanceState } from "@/lib/data-automation-governance";
import { TAVILY_EVENT_ROOT_KEY, tavilyCanaryReadiness } from "@/lib/tavily-canary-control";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ category: string; id: string }> };
type Bindings = { TAVILY_API_KEY?: string };

function idFrom(value: string) {
  const id = Number.parseInt(value, 10);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export default async function TavilyDiscoveryRootPage({ params }: Props) {
  const resolved = await params;
  const category = automationCategoryBySlug(resolved.category);
  const id = idFrom(resolved.id);
  if (!category || !id) notFound();
  const user = await requireAdminPageUser("/admin/automatizacie/" + resolved.category + "/discovery/" + resolved.id);
  const root = await getAutomationDiscoveryRoot(id).catch(() => null);
  if (
    !root
    || root.rootKey !== TAVILY_EVENT_ROOT_KEY
    || root.entityType !== "EVENT"
    || root.discoveryType !== "SEARCH_PROVIDER"
    || !category.entityTypes.includes("EVENT")
  ) notFound();

  const [governance, runs] = await Promise.all([
    getGovernanceState({ type: "DISCOVERY_ROOT", id }).catch(() => ({ schemaAvailable: false, state: null })),
    listAutomationDiscoveryRuns(id, undefined, 10).catch(() => []),
  ]);
  const bindings = env as unknown as Bindings;
  const secretConfigured = Boolean(bindings.TAVILY_API_KEY?.trim());
  const readiness = tavilyCanaryReadiness({ root, governance, secretConfigured });

  return (
    <AdminShell
      user={user}
      eyebrow="Automatizácie · Podujatia · Discovery"
      title={root.label}
      description="Governance review, technické schválenie, zapnutie a prvý kontrolovaný Tavily canary run."
      actions={<><Link href={"/admin/automatizacie/" + resolved.category}>← Podujatia</Link><Link href="/admin/automatizacie/zdroje#kandidati">Source candidates</Link></>}
    >
      <AdminTavilyRootDetail
        root={root}
        secretConfigured={secretConfigured}
        governanceAllowed={readiness.governanceEvaluation.allowed}
        governanceBlockingReasons={readiness.governanceEvaluation.blockingReasons}
        canaryAllowed={readiness.allowed}
        canaryBlockers={readiness.blockers}
        runs={runs}
      />
    </AdminShell>
  );
}
