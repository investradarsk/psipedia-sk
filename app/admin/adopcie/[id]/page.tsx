import { env } from "cloudflare:workers";
import { getAdminEntityReview } from "@/lib/admin-entity-review-store";
import { AdminPartnerCanonicalAudit } from "@/components/admin-partner-canonical-audit";
import { Suspense } from "react";
import Link from "next/link";
import { adminReturnHref } from "@/lib/admin-return-navigation";
import { notFound } from "next/navigation";
import { AdminAdoptionEditor } from "@/components/admin-adoption-editor";
import { AdminPartnerReviewStatus } from "@/components/admin-partner-review-status";
import { AdminCanonicalDraftWarning } from "@/components/admin-canonical-draft-warning";
import { AdminGeminiOriginBadge } from "@/components/admin-gemini-origin-badge";
import { AdminPartnerCanonicalDraft } from "@/components/admin-partner-canonical-draft";
import { AdminCanonicalDraftDelete } from "@/components/admin-canonical-draft-delete";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { adoptionStatusLabels, isAdoptionPublicStatus, type AdoptionStatus } from "@/lib/adoption";
import { adoptionDetailPath } from "@/lib/adoption-detail";
import { listAdoptionAdminBreedOptions, listAdoptionAdminOrganizationOptions } from "@/lib/adoption-admin-write";
import { getAdoptionById } from "@/lib/adoption-store";
import { getCanonicalDraftDuplicateWarning } from "@/lib/canonical-draft-flags";
import { listCanonicalAutomationUpdateSuggestions } from "@/lib/data-automation-update-review";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ returnTo?: string | string[] }> };

export default async function EditAdoptionPage({ params, searchParams }: Props) {
  const returnHref = adminReturnHref((await searchParams).returnTo, ["/admin/adopcie", "/admin/pomoc-psom", "/admin/kvalita/seo"]);
  const { id } = await params;
  const numericId = Number.parseInt(id, 10);
  if (!Number.isSafeInteger(numericId) || numericId < 1) notFound();
  const user = await requireAdminPageUser(`/admin/adopcie/${id}`);
  // The selected breed is the only dependent option; start all other
  // canonical lookups together and await their already-running promises.
  const [item, organizations, duplicateWarning, automationSuggestions] = await Promise.all([
    getAdoptionById(numericId),
    listAdoptionAdminOrganizationOptions(),
    getCanonicalDraftDuplicateWarning("ADOPTION", numericId).catch(() => null),
    listCanonicalAutomationUpdateSuggestions({ entityType: "ADOPTION", canonicalEntityId: numericId }),
  ]);
  if (!item) notFound();
  const review=(env as unknown as {NOTION_PROFILE_AUTHORITY_MODE?:string}).NOTION_PROFILE_AUTHORITY_MODE==="validated-text"?await getAdminEntityReview("ADOPTION",item.id):null;
  const selectedBreed = item.breedId && item.breedName.trim()
    ? { id: item.breedId, name: item.breedName }
    : null;
  // This option set alone depends on the selected breed of the loaded item.
  const breeds = await listAdoptionAdminBreedOptions(undefined, selectedBreed, item.breedId);
  return <AdminShell recordId={item.id} user={user} eyebrow={adoptionStatusLabels[item.status as AdoptionStatus]} title={`Upraviť: ${item.name}`} description="Server pri každom uložení znovu validuje celý profil, lifecycle prechod aj canonical väzby." actions={<><AdminPartnerReviewStatus entityType="ADOPTION" entityId={item.id} />{isAdoptionPublicStatus(item.status) && <Link href={adoptionDetailPath(item.slug)} target="_blank" rel="noreferrer">Otvoriť verejný profil ↗</Link>}<Link href={returnHref}>{returnHref.startsWith("/admin/kvalita/seo?") ? "← Späť na SEO audit" : "← Späť na adopcie"}</Link></>}><Suspense fallback={null}><AdminPartnerCanonicalDraft resourceType="ADOPTION_DOG" canonicalId={item.id} /></Suspense><Suspense fallback={null}><AdminPartnerCanonicalAudit resourceType="ADOPTION_DOG" canonicalId={item.id} /></Suspense><AdminGeminiOriginBadge agenda="adoptions" entityId={item.id} /><AdminCanonicalDraftWarning warning={duplicateWarning} /><AdminAdoptionEditor item={item} initialReview={review} breeds={breeds} organizations={organizations} automationSuggestions={automationSuggestions} returnHref={returnHref}/>{item.status === "DRAFT" && <AdminCanonicalDraftDelete entityType="ADOPTION" canonicalEntityId={item.id} returnHref={returnHref} />}</AdminShell>;
}
