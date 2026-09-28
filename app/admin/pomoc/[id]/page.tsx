import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminHelpEditor } from "@/components/admin-help-editor";
import { AdminCanonicalDraftWarning } from "@/components/admin-canonical-draft-warning";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getManagedHelpCaseById } from "@/lib/help-store";
import { getCanonicalDraftDuplicateWarning } from "@/lib/canonical-draft-flags";
import { listCanonicalAutomationUpdateSuggestions } from "@/lib/data-automation-update-review";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export default async function EditHelpCasePage({ params }: Props) {
  const { id } = await params; const numericId = Number.parseInt(id, 10);
  if (!Number.isSafeInteger(numericId) || numericId < 1) notFound();
  const user = await requireAdminPageUser(`/admin/pomoc/${id}`);
  const item = await getManagedHelpCaseById(numericId); if (!item) notFound();
  const entityType = item.category === "docasna-opatera" ? "FOSTER" as const : "HELP_ITEM" as const;
  const [duplicateWarning, automationSuggestions] = await Promise.all([
    getCanonicalDraftDuplicateWarning(entityType, item.id).catch(() => null),
    listCanonicalAutomationUpdateSuggestions({ entityType, canonicalEntityId: item.id }),
  ]);
  return <AdminShell
    user={user}
    eyebrow={item.status === "published" ? "Publikovaný Help záznam" : "Rozpracovaný Help koncept"}
    title="Upraviť Help prípad"
    description="Uprav iba canonical generic Help záznam. Publikačný stav, urgentnosť a vyriešenie zostávajú vedomé redakčné rozhodnutia."
   actions={<Link href="/admin/pomoc">← Späť na pomoc psom</Link>}>
    <AdminCanonicalDraftWarning warning={duplicateWarning} />
    <AdminHelpEditor item={item} automationSuggestions={automationSuggestions} />
  </AdminShell>;
}
