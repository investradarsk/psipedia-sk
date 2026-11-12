import { AdminDataLoading } from "@/components/admin-data-loading";

/** Avoid a white screen while the canonical record and locations are loading. */
export default function OrganizationAdminDetailLoading() {
  return <main id="obsah" className="admin-root" data-admin-organization-loading>
    <div className="admin-shell shell">
      <AdminDataLoading label="Detail organizácie a potvrdená adresa" />
    </div>
  </main>;
}
