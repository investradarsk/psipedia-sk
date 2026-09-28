import Link from "next/link";
import { AdminAddressEnrichmentCanary } from "@/components/admin-address-enrichment-canary";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminAddressEnrichmentPage() {
  const user = await requireAdminPageUser("/admin/nastroje/address-enrichment");
  return (
    <AdminShell
      user={user}
      eyebrow="Admin · Nástroje"
      title="Doplnenie adries — canary"
      description="Kontrolované live discovery a exact provider verification pre malú vzorku DIRECTORY profilov."
      actions={<Link href="/admin/nastroje">Späť na Nástroje</Link>}
    >
      <AdminAddressEnrichmentCanary />
    </AdminShell>
  );
}
