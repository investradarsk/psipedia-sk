import Link from "next/link";
import { AdminBreedDashboard } from "@/components/admin-breed-dashboard";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listManagedBreeds } from "@/lib/breed-store";
export const dynamic="force-dynamic";
export default async function AdminBreedsPage(){const user=await requireAdminPageUser("/admin/plemena");return <AdminShell user={user} eyebrow="Atlas plemien" title="Plemená" description="Pridávaj profily plemien, upravuj ich údaje a rozhodni, ktoré sú verejné." actions={<Link className="admin-primary-action" href="/admin/plemena/novy">+ Nové plemeno</Link>}><AdminBreedDashboard initialBreeds={await listManagedBreeds()}/></AdminShell>}
