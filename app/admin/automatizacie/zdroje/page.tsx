import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { AdminAutomationAvailabilityState } from "@/app/admin/automatizacie/_components/automation-availability-state";
import { AdminAutomationSourceManager } from "@/components/admin-automation-source-manager";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listAutomationSourceCandidates, listAutomationSourcesAdmin } from "@/lib/data-automation-source-store";
import { listAutomationDiscoveryRoots } from "@/lib/data-automation-discovery-store";
import { readAdminAutomationData, summarizeAdminAutomationReads } from "@/lib/admin-automation-reliability";

export const dynamic = "force-dynamic";

export default async function AutomationSourcesPage() {
  const user = await requireAdminPageUser("/admin/automatizacie/zdroje");
  const [sourcesRead, candidatesRead, discoveryRootsRead] = await Promise.all([
    readAdminAutomationData({
      key: "sources-admin:sources",
      load: () => listAutomationSourcesAdmin(),
      fallback: [],
      empty: (value) => value.length === 0,
    }),
    readAdminAutomationData({
      key: "sources-admin:candidates",
      load: () => listAutomationSourceCandidates(),
      fallback: [],
      empty: (value) => value.length === 0,
    }),
    readAdminAutomationData({
      key: "sources-admin:discovery-roots",
      load: () => listAutomationDiscoveryRoots(),
      fallback: [],
      empty: (value) => value.length === 0,
    }),
  ]);
  const reliability = summarizeAdminAutomationReads([sourcesRead, candidatesRead, discoveryRootsRead]);
  const sources = sourcesRead.data;
  const candidates = candidatesRead.data;
  const discoveryRoots = discoveryRootsRead.data;

  return (
    <AdminShell
      user={user}
      eyebrow="Automatizácie"
      title="Pokročilé — všetky zdroje a discovery"
      description="Globálny technický pohľad na zdroje, candidates a discovery roots. Bežná denná kontrola patrí do konkrétnych kategórií automatizácií."
      actions={<><Link href="/admin/automatizacie">← Späť na automatizácie</Link><Link href="/admin/operations">Operácie</Link></>}
    >
      <AdminAutomationAvailabilityState summary={reliability} refreshHref="/admin/automatizacie/zdroje" />
      <AdminAutomationSourceManager sources={sources} candidates={candidates} discoveryRoots={discoveryRoots} />
    </AdminShell>
  );
}
