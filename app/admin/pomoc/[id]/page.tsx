import Link from "next/link";
import { adminReturnHref } from "@/lib/admin-return-navigation";
import { notFound } from "next/navigation";
import { AdminHelpEditor } from "@/components/admin-help-editor";
import { AdminPartnerReviewStatus } from "@/components/admin-partner-review-status";
import { AdminCanonicalDraftWarning } from "@/components/admin-canonical-draft-warning";
import { AdminGeminiOriginBadge } from "@/components/admin-gemini-origin-badge";
import { AdminPartnerCanonicalDraft } from "@/components/admin-partner-canonical-draft";
import { AdminCanonicalDraftDelete } from "@/components/admin-canonical-draft-delete";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { helpCaseHref } from "@/lib/help";
import { getManagedHelpCaseById } from "@/lib/help-store";
import { getCanonicalDraftDuplicateWarning } from "@/lib/canonical-draft-flags";
import { listCanonicalAutomationUpdateSuggestions } from "@/lib/data-automation-update-review";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ returnTo?: string | string[] }> };

export default async function EditHelpCasePage({ params, searchParams }: Props) {
  const returnHref = adminReturnHref((await searchParams).returnTo, ["/admin/pomoc", "/admin/pomoc-psom"]);
  const { id } = await params; const numericId = Number.parseInt(id, 10);
  if (!Number.isSafeInteger(numericId) || numericId < 1) notFound();
  const user = await requireAdminPageUser(`/admin/pomoc/${id}`);
  // The review badge is independent of the category-specific FOSTER/HELP_ITEM
  // warning and update suggestions, so begin its read alongside the item.
  const item = await getManagedHelpCaseById(numericId);
  if (!item) notFound();
  const entityType = item.category === "docasna-opatera" ? "FOSTER" as const : "HELP_ITEM" as const;
  const [duplicateWarning, automationSuggestions] = await Promise.all([
    getCanonicalDraftDuplicateWarning(entityType, item.id).catch(() => null),
    listCanonicalAutomationUpdateSuggestions({ entityType, canonicalEntityId: item.id }),
  ]);
  return <AdminShell recordId={numericId}
    user={user}
    eyebrow={item.status === "published" ? "Publikovaný Help záznam" : "Rozpracovaný Help koncept"}
    title={item.title}
    description="Úprava prípadu. Publikácia, urgentnosť a vybavenie sa nastavujú samostatne."
   actions={<>
    <AdminPartnerReviewStatus entityType="HELP_CASE" entityId={item.id} />
    {item.status === "published" && <Link href={helpCaseHref(item)} target="_blank" rel="noreferrer">Otvoriť verejný záznam ↗</Link>}
    <Link href={returnHref}>← Späť na pomoc psom</Link>
   </>}>
    <AdminPartnerCanonicalDraft resourceType="HELP_CASE" canonicalId={item.id} /><AdminGeminiOriginBadge agenda="help-cases" entityId={item.id} /><AdminCanonicalDraftWarning warning={duplicateWarning} />
    <AdminHelpEditor item={item} automationSuggestions={automationSuggestions} returnHref={returnHref} />
    {item.status === "draft" && <AdminCanonicalDraftDelete entityType={entityType} canonicalEntityId={item.id} returnHref={returnHref} />}
  </AdminShell>;
}
