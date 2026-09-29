import { env } from "cloudflare:workers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { AdminAutomationAvailabilityState } from "@/app/admin/automatizacie/_components/automation-availability-state";
import { AdminTavilyRootDetail } from "@/components/admin-tavily-root-detail";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { automationCategoryBySlug } from "@/lib/admin-automation-presentation";
import {
  getAutomationDiscoveryRoot,
  listAutomationDiscoveryRuns,
} from "@/lib/data-automation-discovery-store";
import { getGovernanceState } from "@/lib/data-automation-governance";
import { isTavilySearchDiscoveryRoot, tavilyCanaryReadiness } from "@/lib/tavily-canary-control";
import { readAdminAutomationData, summarizeAdminAutomationReads } from "@/lib/admin-automation-reliability";

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
  const rootRead = await readAdminAutomationData({
    key: `discovery-detail:${id}:root`,
    load: () => getAutomationDiscoveryRoot(id),
    fallback: null,
    empty: (value) => value === null,
  });
  const rootOnlyReliability = summarizeAdminAutomationReads([rootRead]);
  if (rootRead.status === "UNAVAILABLE") {
    return (
      <AdminShell
        user={user}
        eyebrow={`Automatizácie · ${category.title} · Discovery`}
        title="Discovery zdroj"
        description="Detail discovery sa momentálne nepodarilo bezpečne načítať."
        actions={<Link href={`/admin/automatizacie/${resolved.category}`}>← {category.title}</Link>}
      >
        <AdminAutomationAvailabilityState
          summary={rootOnlyReliability}
          refreshHref={`/admin/automatizacie/${resolved.category}/discovery/${id}`}
        />
      </AdminShell>
    );
  }
  const root = rootRead.data;
  if (
    !root
    || !isTavilySearchDiscoveryRoot(root)
    || !category.entityTypes.includes(root.entityType)
  ) notFound();

  const [governanceRead, runsRead] = await Promise.all([
    readAdminAutomationData({
      key: `discovery-detail:${id}:governance`,
      load: () => getGovernanceState({ type: "DISCOVERY_ROOT", id }),
      fallback: { schemaAvailable: false, state: null },
      empty: (value) => !value.schemaAvailable && value.state === null,
    }),
    readAdminAutomationData({
      key: `discovery-detail:${id}:runs`,
      load: () => listAutomationDiscoveryRuns(id, undefined, 10),
      fallback: [],
      empty: (value) => value.length === 0,
    }),
  ]);
  const reliability = summarizeAdminAutomationReads([rootRead, governanceRead, runsRead]);
  const governance = governanceRead.data;
  const runs = runsRead.data;
  const bindings = env as unknown as Bindings;
  const secretConfigured = Boolean(bindings.TAVILY_API_KEY?.trim());
  const readiness = tavilyCanaryReadiness({ root, governance, secretConfigured });

  return (
    <AdminShell
      user={user}
      eyebrow={"Automatizácie · " + category.title + " · Discovery"}
      title={root.label}
      description="Governance review, technické schválenie, zapnutie a prvý kontrolovaný Tavily canary run."
      actions={<><Link href={"/admin/automatizacie/" + resolved.category}>← {category.title}</Link><Link href="/admin/automatizacie/zdroje#kandidati">Source candidates</Link></>}
    >
      <AdminAutomationAvailabilityState
        summary={reliability}
        refreshHref={`/admin/automatizacie/${resolved.category}/discovery/${id}`}
      />
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
