import { notFound } from "next/navigation";
import { AdminHelpEditor } from "@/components/admin-help-editor";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getManagedHelpCaseById } from "@/lib/help-store";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export default async function EditHelpCasePage({ params }: Props) {
  const { id } = await params; const numericId = Number.parseInt(id, 10);
  if (!Number.isSafeInteger(numericId) || numericId < 1) notFound();
  const user = await requireAdminPageUser(`/admin/pomoc/${id}`);
  const item = await getManagedHelpCaseById(numericId); if (!item) notFound();
  return <AdminShell user={user} eyebrow={item.status === "published" ? "Publikovaný prípad" : "Rozpracovaný koncept"} title="Upraviť prípad pomoci" description="Zmeny ulož ako koncept alebo ich rovno publikuj."><AdminHelpEditor item={item} /></AdminShell>;
}
