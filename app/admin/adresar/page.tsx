import Link from "next/link";
import { AdminDirectoryDashboard } from "@/components/admin-directory-dashboard";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listManagedDirectoryProfiles } from "@/lib/directory-store";

export const dynamic = "force-dynamic";

export default async function AdminDirectoryPage() {
  const user = await requireAdminPageUser("/admin/adresar");
  return <AdminShell user={user} eyebrow="Adresár psieho sveta" title="Profily a služby" description="Pridávaj trénerov, kluby, útulky a ďalšie služby. Verejné sú iba publikované profily." actions={<Link className="admin-primary-action" href="/admin/adresar/novy">+ Nový profil</Link>}><AdminDirectoryDashboard initialProfiles={await listManagedDirectoryProfiles()} /></AdminShell>;
}
