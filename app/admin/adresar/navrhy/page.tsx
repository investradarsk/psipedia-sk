import { AdminDirectoryChangeRequests } from "@/components/admin-directory-change-requests";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listDirectoryProfileChangeRequests } from "@/lib/directory-store";

export const dynamic = "force-dynamic";

export default async function AdminDirectoryChangeRequestsPage() {
  const user = await requireAdminPageUser("/admin/adresar/navrhy");
  return <AdminShell user={user} eyebrow="Služby pre psov" title="Návrhy úprav profilov" description="Každý návrh porovnaj s aktuálnym profilom. Schválenie iba zaznamená rozhodnutie; údaje prenes bezpečne cez editor profilu."><AdminDirectoryChangeRequests initialRequests={await listDirectoryProfileChangeRequests()} /></AdminShell>;
}
