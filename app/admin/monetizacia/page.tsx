import { AdminMonetizationDashboard } from "@/components/admin-monetization-dashboard";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listMonetizationAdminData } from "@/lib/monetization-store";

export const dynamic = "force-dynamic";

export default async function AdminMonetizationPage() {
  const user = await requireAdminPageUser("/admin/monetizacia");
  return (
    <AdminShell
      user={user}
      eyebrow="Monetizácia"
      title="Reklamy, kampane a promoted listingy"
      description="Foundation pre priame kampane, programmatic reklamu a jasne označené sponzorované canonical entity. Bez reálnych kampaní sa na public webe nič nezobrazí."
    >
      <AdminMonetizationDashboard initialData={await listMonetizationAdminData()} />
    </AdminShell>
  );
}
