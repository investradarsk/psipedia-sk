import Link from "next/link";
import { AdminHelpDashboard } from "@/components/admin-help-dashboard";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listManagedHelpCaseSummaries } from "@/lib/help-store";

export const dynamic = "force-dynamic";

export default async function AdminHelpPage() {
  const user = await requireAdminPageUser("/admin/pomoc");
  return <AdminShell user={user} eyebrow="Pomoc psom" title="Prípady a výzvy pod kontrolou" description="Pridávaj adopcie, pátrania, urgentné prípady a iba overené zbierky." actions={<Link className="admin-primary-action" href="/admin/pomoc/novy">+ Nový prípad</Link>}><AdminHelpDashboard initialItems={await listManagedHelpCaseSummaries()} /></AdminShell>;
}
