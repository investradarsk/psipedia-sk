import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminAdoptionEditor } from "@/components/admin-adoption-editor";
import { AdminReviewCheckbox } from "@/components/admin-review-checkbox";
import { AdminCanonicalDraftWarning } from "@/components/admin-canonical-draft-warning";
import { AdminGeminiOriginBadge } from "@/components/admin-gemini-origin-badge";
import { AdminCanonicalDraftDelete } from "@/components/admin-canonical-draft-delete";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getAdminEntityReview } from "@/lib/admin-entity-review-store";
import { adoptionStatusLabels, isAdoptionPublicStatus, type AdoptionStatus } from "@/lib/adoption";
import { adoptionDetailPath } from "@/lib/adoption-detail";
import { listAdoptionAdminBreedOptions, listAdoptionAdminOrganizationOptions } from "@/lib/adoption-admin-write";
import { getAdoptionById } from "@/lib/adoption-store";
import { getCanonicalDraftDuplicateWarning } from "@/lib/canonical-draft-flags";
import { listCanonicalAutomationUpdateSuggestions } from "@/lib/data-automation-update-review";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export default async function EditAdoptionPage({ params }: Props) {
  const { id } = await params;
  const numericId = Number.parseInt(id, 10);
  if (!Number.isSafeInteger(numericId) || numericId < 1) notFound();
  const user = await requireAdminPageUser(`/admin/adopcie/${id}`);
  // The selected breed is the only dependent option; start all other
  // canonical lookups together and await their already-running promises.
  const organizationsPromise = listAdoptionAdminOrganizationOptions();
  const duplicateWarningPromise = getCanonicalDraftDuplicateWarning("ADOPTION", numericId).catch(() => null);
  const automationSuggestionsPromise = listCanonicalAutomationUpdateSuggestions({ entityType: "ADOPTION", canonicalEntityId: numericId });
  const reviewPromise = getAdminEntityReview("ADOPTION", numericId);
  const item = await getAdoptionById(numericId);
  if (!item) notFound();
  const selectedBreed = item.breedId && item.breedName.trim()
    ? { id: item.breedId, name: item.breedName }
    : null;
  const [organizations, breeds, duplicateWarning, automationSuggestions, review] = await Promise.all([
    organizationsPromise,
    listAdoptionAdminBreedOptions(undefined, selectedBreed, item.breedId),
    duplicateWarningPromise,
    automationSuggestionsPromise,
    reviewPromise,
  ]);
  return <AdminShell user={user} eyebrow={adoptionStatusLabels[item.status as AdoptionStatus]} title={`Upraviť: ${item.name}`} description="Server pri každom uložení znovu validuje celý profil, lifecycle prechod aj canonical väzby." actions={<><AdminReviewCheckbox entityType="ADOPTION" entityId={item.id} initialReviewed={review.reviewed} initialReviewedAt={review.reviewedAt} showDate />{isAdoptionPublicStatus(item.status) && <Link href={adoptionDetailPath(item.slug)} target="_blank" rel="noreferrer">Otvoriť verejný profil ↗</Link>}<Link href="/admin/adopcie">← Späť na adopcie</Link></>}><AdminGeminiOriginBadge agenda="adoptions" entityId={item.id} /><AdminCanonicalDraftWarning warning={duplicateWarning} /><AdminAdoptionEditor item={item} breeds={breeds} organizations={organizations} automationSuggestions={automationSuggestions}/>{item.status === "DRAFT" && <AdminCanonicalDraftDelete entityType="ADOPTION" canonicalEntityId={item.id} returnHref="/admin/adopcie" />}</AdminShell>;
}
