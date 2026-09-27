import { notFound } from "next/navigation";
import { AdminHelpEditor } from "@/components/admin-help-editor";
import { AdminAutomationDraftWarning } from "@/components/admin-automation-draft-warning";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getManagedHelpCaseById } from "@/lib/help-store";
import { getAutomationDraftDuplicateWarning } from "@/lib/data-automation-store";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export default async function EditHelpCasePage({ params }: Props) {
  const { id } = await params; const numericId = Number.parseInt(id, 10);
  if (!Number.isSafeInteger(numericId) || numericId < 1) notFound();
  const user = await requireAdminPageUser(`/admin/pomoc/${id}`);
  const item = await getManagedHelpCaseById(numericId); if (!item) notFound();
  const duplicateWarning = await getAutomationDraftDuplicateWarning("FOSTER", item.id).catch(() => null)
    ?? await getAutomationDraftDuplicateWarning("HELP_ITEM", item.id).catch(() => null);
  return <AdminShell
    user={user}
    eyebrow={item.status === "published" ? "Publikovaný Help záznam" : "Rozpracovaný Help koncept"}
    title="Upraviť Help prípad"
    description="Uprav iba canonical generic Help záznam. Publikačný stav, urgentnosť a vyriešenie zostávajú vedomé redakčné rozhodnutia."
  >
    <AdminAutomationDraftWarning warning={duplicateWarning} />
    <AdminHelpEditor item={item} />
  </AdminShell>;
}
