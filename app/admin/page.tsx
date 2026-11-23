import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { AdminWorkspaceDashboard } from "@/components/admin-workspace-dashboard";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { loadRequestAdminAttentionSummary } from "@/lib/admin-attention-request";
import {
  readAdminAutomationData,
} from "@/lib/admin-automation-reliability";
import { env } from "cloudflare:workers";
import { loadAdminQualityPendingSummary } from "@/lib/admin-quality-pending-summary";
import { loadAdminWorkspaceOverview } from "@/lib/admin-workspace-feed";
import { settleAdminOverviewRead } from "@/lib/admin-overview-read";
import { adminAttentionQueueSourceTypes } from "@/lib/admin-attention-queue";
import type { AdminAttentionExactSummary } from "@/lib/admin-attention-queue-store";

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
      const result = await loadAdminQualityPendingSummary((env as unknown as {DB?: D1Database}).DB);
      if (!result.schemaReady) throw Error("Quality suggestions unavailable");
      return { profilesWithCoreIssues: result.total, mediaIssues: 0 };
    },
    fallback: { profilesWithCoreIssues: 0, mediaIssues: 0 },
    empty: (value) => value.profilesWithCoreIssues === 0 && value.mediaIssues === 0,
  });
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireAdminPageUser("/admin");
  const params = await searchParams;
  const legacyHref = legacyArticleListHref(params);
  if (legacyHref) redirect(legacyHref);

  // Start independent D1 reads immediately, but do not hold back the admin shell.
  // Pass the *same* attention promise to the bell and dashboard: one exact read.
  const unavailableAttention: AdminAttentionExactSummary = {
    active: 0,
    availability: "UNAVAILABLE",
    bySource: Object.fromEntries(adminAttentionQueueSourceTypes.map((source) => [source, null]))
      as AdminAttentionExactSummary["bySource"],
    unavailableSources: [...adminAttentionQueueSourceTypes],
  };

  // Time out only optional reads. Authentication still runs before rendering.
  // All three readers stay independent, and their fallbacks remain explicitly
  // UNAVAILABLE rather than reporting an incorrect count of zero.
  const attentionPromise = settleAdminOverviewRead(
    loadRequestAdminAttentionSummary(), unavailableAttention,
  );
  const qualityPromise = settleAdminOverviewRead(
    loadWorkspaceQuality(),
    {
      key: "admin-workspace:data-quality",
      status: "UNAVAILABLE" as const,
      data: { profilesWithCoreIssues: 0, mediaIssues: 0 },
      checkedAt: new Date().toISOString(),
      errorRef: null,
    },
  );
  const workspaceFeedPromise = settleAdminOverviewRead(
    loadAdminWorkspaceOverview(), { nextGemini: null, status: "UNAVAILABLE" as const },
  );

  return (
    <AdminShell
      user={user}
      eyebrow="Admin"
      title="Pracovný prehľad"
      description="Začni tým, čo čaká na kontrolu. Odtiaľto sa dostaneš priamo do canonical frontov, správy obsahu, automatizácií a kvality údajov."
      actions={<Link className="admin-primary-action" href="/admin/novy">+ Nový obsah</Link>}
      attentionSummaryPromise={attentionPromise}
    >
      <AdminWorkspaceDashboard
        attentionPromise={attentionPromise}
        qualityPromise={qualityPromise}
        activityPromise={workspaceFeedPromise}
      />
    </AdminShell>
  );
}
