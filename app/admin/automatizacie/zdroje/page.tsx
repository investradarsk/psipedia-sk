import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { AdminAutomationSourceManager } from "@/components/admin-automation-source-manager";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listAutomationSourceCandidates, listAutomationSourcesAdmin } from "@/lib/data-automation-source-store";
import { listAutomationDiscoveryRoots } from "@/lib/data-automation-discovery-store";

export const dynamic = "force-dynamic";

export default async function AutomationSourcesPage() {
  const user = await requireAdminPageUser("/admin/automatizacie/zdroje");
  let sources = [];
  let candidates = [];
  let discoveryRoots = [];
  let unavailable = false;
  try {
    [sources, candidates, discoveryRoots] = await Promise.all([
      listAutomationSourcesAdmin(),
      listAutomationSourceCandidates(),
      listAutomationDiscoveryRoots(),
    ]);
  } catch {
    unavailable = true;
  }

  return (
    <AdminShell
      user={user}
      eyebrow="Automatizácie"
      title="Pokročilé — všetky zdroje a discovery"
      description="Globálny technický pohľad na zdroje, candidates a discovery roots. Bežná denná kontrola patrí do konkrétnych kategórií automatizácií."
      actions={<><Link href="/admin/automatizacie">← Späť na automatizácie</Link><Link href="/admin/operations">Operácie</Link></>}
    >
      {unavailable ? (
        <section className="admin-panel">
          <h2>Source-management schema ešte nie je dostupná</h2>
          <p>Po sprístupnení automation schémy sa zobrazia zdroje, review a discovery candidates.</p>
        </section>
      ) : <AdminAutomationSourceManager sources={sources} candidates={candidates} discoveryRoots={discoveryRoots} />}
    </AdminShell>
  );
}
