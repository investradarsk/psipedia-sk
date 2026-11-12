"use client";

import { useEffect } from "react";
import { AdminErrorRecovery } from "@/components/admin-recovery-actions";

/** Only the detail subtree failed. Keep distinct from a missing organization. */
export default function OrganizationAdminDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("admin_organization_detail_failed", error.digest ?? error.name);
  }, [error]);

  return <AdminErrorRecovery
    error={error}
    reset={reset}
    title="Detail organizácie sa nepodarilo načítať"
    backHref="/admin/organizacie"
  />;
}
