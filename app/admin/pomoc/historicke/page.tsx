import { AdminShell } from "@/components/admin-shell";
import { AdminHelpLegacyCleanup } from "@/components/admin-help-legacy-cleanup";
import { requireAdminPageUser } from "@/lib/admin-auth";
export const dynamic="force-dynamic";
export default async function HistoricalHelpCleanupPage() {
 const user=await requireAdminPageUser("/admin/pomoc/historicke");
 return <AdminShell user={user} eyebrow="Pomoc psom" title="Odstránenie historických kópií"
   description="Jednorazové čistenie historických duplikátov po SQL migrácii.">
   <AdminHelpLegacyCleanup />
 </AdminShell>;
}
