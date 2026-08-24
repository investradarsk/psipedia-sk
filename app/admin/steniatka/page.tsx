import Link from "next/link";
import { AdminDashboard } from "@/components/admin-dashboard";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listManagedArticles } from "@/lib/article-store";
export const dynamic = "force-dynamic";
export default async function AdminPuppiesPage() {
  const user = await requireAdminPageUser("/admin/steniatka");
  return <AdminShell user={user} eyebrow="Obsah pre nových majiteľov" title="Šteniatka" description="Pridávaj a upravuj články, ktoré sa zobrazujú v sekcii Šteniatka." actions={<Link className="admin-primary-action" href="/admin/novy?sekcia=steniatka">+ Nový článok o šteniatkach</Link>}><AdminDashboard initialArticles={await listManagedArticles()} fixedPortalSection="steniatka" /></AdminShell>;
}
