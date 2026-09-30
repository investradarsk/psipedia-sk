import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { AdminWorkspaceDashboard } from "@/components/admin-workspace-dashboard";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { loadExactAdminAttentionSummary } from "@/lib/admin-attention-queue-store";
import {
  readAdminAutomationData,
  summarizeAdminAutomationReads,
} from "@/lib/admin-automation-reliability";
import { getAdminDataQualitySummary } from "@/lib/admin-dashboard-store";
import { countOpenAutomationLifecycleSuggestions } from "@/lib/data-automation-lifecycle-store";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
const legacyArticleFilterKeys = new Set(["query", "q", "status", "section", "sort", "direction", "page", "pageSize"]);

function legacyArticleListHref(params: SearchParams) {
  if (!Object.keys(params).some((key) => legacyArticleFilterKeys.has(key))) return null;
  const query = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    if (raw === undefined) continue;
    for (const value of Array.isArray(raw) ? raw : [raw]) query.append(key, value);
  }
  return query.size ? `/admin/clanky?${query.toString()}` : "/admin/clanky";
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireAdminPageUser("/admin");
  const params = await searchParams;
  const legacyHref = legacyArticleListHref(params);
  if (legacyHref) redirect(legacyHref);

  const [attention, automationLifecycleRead, qualityRead] = await Promise.all([
    loadExactAdminAttentionSummary(),
    readAdminAutomationData({
      key: "admin-workspace:automation-lifecycle",
      load: () => countOpenAutomationLifecycleSuggestions(),
      fallback: 0,
      empty: (value) => value === 0,
    }),
    readAdminAutomationData({
      key: "admin-workspace:data-quality",
      load: () => getAdminDataQualitySummary(),
      fallback: { profilesWithCoreIssues: 0, mediaIssues: 0 },
      empty: (value) => value.profilesWithCoreIssues === 0 && value.mediaIssues === 0,
    }),
  ]);

  const workspaceReliability = summarizeAdminAutomationReads([
    automationLifecycleRead,
    qualityRead,
  ]);

  return (
    <AdminShell
      user={user}
      eyebrow="Admin"
      title="Pracovný prehľad"
      description="Začni tým, čo čaká na kontrolu. Odtiaľto sa dostaneš priamo do canonical frontov, správy obsahu, automatizácií a kvality údajov."
      actions={<Link className="admin-primary-action" href="/admin/novy">+ Nový obsah</Link>}
      attentionCount={attention.active}
      attentionCountPartial={attention.availability !== "OK"}
    >
      <AdminWorkspaceDashboard
        attention={attention}
        automationLifecycle={{
          status: automationLifecycleRead.status,
          value: automationLifecycleRead.data,
        }}
        quality={{
          status: qualityRead.status,
          data: qualityRead.data,
        }}
        workspaceReliability={workspaceReliability}
      />
    </AdminShell>
  );
}
