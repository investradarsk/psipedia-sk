import { qualityWorkspace } from "@/lib/admin-quality-workspace";
import { AdminQualityWorkspaceTabs } from "@/components/admin-quality-workspace-tabs";
import { AdminShell } from "@/components/admin-shell";
import { AdminLinkHealthChecker } from "@/components/admin-link-health-checker";
import { requireAdminPageUser } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminLinkHealthPage() {
  const user = await requireAdminPageUser("/admin/kontrola-odkazov");
  return (
    <AdminShell
      user={user}
      {...qualityWorkspace("links")}
    >
      <AdminQualityWorkspaceTabs active="links" />
      <AdminLinkHealthChecker />
    </AdminShell>
  );
}
