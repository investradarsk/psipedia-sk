import { AdminDogNameDayDashboard } from "@/components/admin-dog-name-day-dashboard";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listDogNameDayRecords } from "@/lib/dog-name-day-store";

export const dynamic = "force-dynamic";

export default async function AdminDogNameDaysPage() {
  const user = await requireAdminPageUser("/admin/meniny");
  const records = await listDogNameDayRecords();
  return (
    <AdminShell
      user={user}
      eyebrow="Kalendár psích mien"
      title="Canonical psie meniny"
      description="Spravuj iba overené mená s dohľadateľným zdrojom. Verejný header používa výhradne publikované záznamy."
    >
      <AdminDogNameDayDashboard initialRecords={records} />
    </AdminShell>
  );
}
