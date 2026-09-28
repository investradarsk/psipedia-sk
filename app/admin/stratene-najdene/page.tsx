import Link from "next/link";
import { AdminLostFoundDashboard } from "@/components/admin-lost-found-dashboard";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getAdminDogReportCounts, listAdminDogReports } from "@/lib/lost-found-dog-store";
import { dogReportTypes, type DogReportType } from "@/lib/lost-found-dogs";
import { LOST_FOUND_STATUSES, type LostFoundStatus } from "@/lib/lost-found-lifecycle.js";

export const dynamic = "force-dynamic";
type Search = Record<string,string|string[]|undefined>; const one=(v:string|string[]|undefined)=>Array.isArray(v)?v[0]||"":v||"";
export default async function LostFoundAdminPage({searchParams}:{searchParams:Promise<Search>}){const user=await requireAdminPageUser("/admin/stratene-najdene");const raw=await searchParams;const q=one(raw.q).slice(0,120),type=one(raw.type),status=one(raw.status),region=one(raw.region).slice(0,80),locality=one(raw.locality).slice(0,120),page=Math.max(1,parseInt(one(raw.page)||"1",10)||1);const safeType=(dogReportTypes as readonly string[]).includes(type)?type as DogReportType:"";const safeStatus=(LOST_FOUND_STATUSES as readonly string[]).includes(status)?status as LostFoundStatus:"";const [result,counts]=await Promise.all([listAdminDogReports({q,type:safeType,status:safeStatus,region,locality,page,pageSize:50}),getAdminDogReportCounts()]);return <AdminShell user={user} eyebrow="Pomoc psom" title="Stratené a nájdené psy" description="Moderácia, publikovanie, životný cyklus a riešenie duplicít. Kontaktné osobné údaje zostávajú iba v administrácii." actions={<Link href="/admin/stratene-najdene/novy">+ Nové hlásenie</Link>}><AdminLostFoundDashboard result={result} counts={counts} filters={{q,type:safeType,status:safeStatus,region,locality}}/></AdminShell>}
