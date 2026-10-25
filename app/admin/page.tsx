import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { AdminWorkspaceDashboard } from "@/components/admin-workspace-dashboard";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { loadExactAdminAttentionSummary } from "@/lib/admin-attention-queue-store";
import {
  readAdminAutomationData,
  summarizeAdminAutomationReads,
} from "@/lib/admin-automation-reliability";
import {loadMissingQualityDashboard,getQualityMissingDatabase} from "@/lib/data-quality-missing-hourly";
import {loadAdminWorkspaceFeed} from "@/lib/admin-workspace-feed";

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

function loadWorkspaceQuality() {
  return readAdminAutomationData({
    key: "admin-workspace:data-quality",
    load: async () => {
      const result = await loadMissingQualityDashboard(getQualityMissingDatabase());
      if (!result.schemaReady) throw Error("Quality suggestions unavailable");
      return { profilesWithCoreIssues: result.total, mediaIssues: 0 };
    },
    fallback: { profilesWithCoreIssues: 0, mediaIssues: 0 },
    empty: (value) => value.profilesWithCoreIssues === 0 && value.mediaIssues === 0,
  });
}

async function AdminDashboardContent({
  attentionPromise,
  qualityPromise,
  workspaceFeedPromise,
}: {
  attentionPromise: ReturnType<typeof loadExactAdminAttentionSummary>;
  qualityPromise: ReturnType<typeof loadWorkspaceQuality>;
  workspaceFeedPromise: ReturnType<typeof loadAdminWorkspaceFeed>;
}) {
  const [attention, qualityRead, workspaceFeed] = await Promise.all([
    attentionPromise, qualityPromise, workspaceFeedPromise,
  ]);
  const workspaceReliability = summarizeAdminAutomationReads([qualityRead]);
  return (
    <AdminWorkspaceDashboard
      attention={attention}
      activity={workspaceFeed}
      quality={{ status: qualityRead.status, data: qualityRead.data }}
      workspaceReliability={workspaceReliability}
    />
  );
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireAdminPageUser("/admin");
  const params = await searchParams;
  const legacyHref = legacyArticleListHref(params);
  if (legacyHref) redirect(legacyHref);

  // Start independent D1 reads immediately, but do not hold back the admin shell.
  // Pass the *same* attention promise to the bell and dashboard: one exact read.
  const attentionPromise = loadExactAdminAttentionSummary();
  const qualityPromise = loadWorkspaceQuality();
  const workspaceFeedPromise = loadAdminWorkspaceFeed(user.email);

  return (
    <AdminShell
      user={user}
      eyebrow="Admin"
      title="Pracovný prehľad"
      description="Začni tým, čo čaká na kontrolu. Odtiaľto sa dostaneš priamo do canonical frontov, správy obsahu, automatizácií a kvality údajov."
      actions={<Link className="admin-primary-action" href="/admin/novy">+ Nový obsah</Link>}
      attentionSummaryPromise={attentionPromise}
    >
      <Suspense fallback={<p role="status" aria-live="polite">Načítava sa pracovný prehľad…</p>}>
        <AdminDashboardContent
          attentionPromise={attentionPromise}
          qualityPromise={qualityPromise}
          workspaceFeedPromise={workspaceFeedPromise}
        />
      </Suspense>
    </AdminShell>
  );
}
