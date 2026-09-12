import Link from "next/link";
import { AdminAdoptionDashboard } from "@/components/admin-adoption-dashboard";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listManagedAdoptions } from "@/lib/adoption-store";
import { isAdoptionStatus, type AdoptionStatus } from "@/lib/adoption";

export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
function first(v: string | string[] | undefined) { return Array.isArray(v) ? v[0] : v; }

export default async function AdminAdoptionsPage({ searchParams }: Props) {
  const user = await requireAdminPageUser("/admin/adopcie");
  const params = await searchParams;
  const rawStatus = first(params.stav) || "";
  const status: AdoptionStatus | "" = isAdoptionStatus(rawStatus) ? rawStatus : "";
  const staleRaw = first(params.overenie);
  const stale = staleRaw === "stale" || staleRaw === "fresh" ? staleRaw : "all";
  const result = await listManagedAdoptions({ q: first(params.q) || "", status, stale, page: Number(first(params.strana)) || 1 });
  return <AdminShell user={user} eyebrow="Psy na adopciu" title="Adopcie" description="Samostatná databáza adopčných psov s overovaním, stavmi a stránkovaním bez hard limitu." actions={<Link className="admin-primary-action" href="/admin/adopcie/novy">+ Pridať psa</Link>}><AdminAdoptionDashboard result={result} query={first(params.q) || ""} status={status} stale={stale} /></AdminShell>;
}
