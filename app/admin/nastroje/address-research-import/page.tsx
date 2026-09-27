import { requireAdminPageUser } from "@/lib/admin-auth";
import AdminAddressResearchAudit from "@/components/admin-address-research-audit";
import AdminAddressResearchImport from "@/components/admin-address-research-import";

export const dynamic = "force-dynamic";

export default async function AddressResearchImportPage() {
  await requireAdminPageUser("/admin/nastroje/address-research-import");
  return (
    <>
      <AdminAddressResearchImport />
      <AdminAddressResearchAudit />
    </>
  );
}
