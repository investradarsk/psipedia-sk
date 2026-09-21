import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { AdminAutomationSourceManager } from "@/components/admin-automation-source-manager";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listAutomationSourceCandidates, listAutomationSourcesAdmin } from "@/lib/data-automation-source-store";
import { listAutomationDiscoveryRoots } from "@/lib/data-automation-discovery-store";

export const dynamic = "force-dynamic";

export default async function AutomationSourcesPage() {
  const user = await requireAdminPageUser("/admin/operations/automation/sources");
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
      eyebrow="Automatický research"
      title="Zdroje a discovery"
      description="Správa kontrolovaných verejných zdrojov. Aktivácia vyžaduje explicitné review a žiadna akcia v tomto module nepublikuje canonical obsah."
      actions={<><Link href="/admin/operations/automation">Stav automatizácie</Link><Link href="/admin/operations">Centrum pozornosti</Link></>}
    >
      {unavailable ? (
        <section className="admin-panel">
          <h2>Source-management schema ešte nie je dostupná</h2>
          <p>Po aplikovaní migrácie 0052 sa zobrazí source CRUD, review a discovery candidates.</p>
        </section>
      ) : <AdminAutomationSourceManager sources={sources} candidates={candidates} discoveryRoots={discoveryRoots} />}
    </AdminShell>
  );
}
