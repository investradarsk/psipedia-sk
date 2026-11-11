import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AdminOrganizationEditor } from "@/components/admin-organization-editor";
import { AdminReviewCheckbox } from "@/components/admin-review-checkbox";
import { AdminCanonicalDraftWarning } from "@/components/admin-canonical-draft-warning";
import { AdminGeminiOriginBadge } from "@/components/admin-gemini-origin-badge";
import { AdminCanonicalDraftDelete } from "@/components/admin-canonical-draft-delete";
import { AdminOrganizationFundraising } from "@/components/admin-organization-fundraising";
import { AdminShell } from "@/components/admin-shell";
import type { OrganizationSuggestionsResult } from "@/components/admin-organization-suggestions";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getAdminEntityReview } from "@/lib/admin-entity-review-store";
import { getOrganizationPublicationAdminById } from "@/lib/help-organization-admin-store";
import type { OrganizationPublicationAdminItem } from "@/lib/help-organization-admin-store";
import { listOrganizationFundraisingMethodsAdmin } from "@/lib/organization-fundraising-admin-store";
import { listOrganizationLocationsAdmin } from "@/lib/organization-location-admin-store";
import { getCanonicalDraftDuplicateWarning } from "@/lib/canonical-draft-flags";
import { listCanonicalAutomationUpdateSuggestions } from "@/lib/data-automation-update-review";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

/** A failed review lookup must not mark a record as unchecked. */
async function OrganizationReviewAction({ organizationId }: { organizationId: number }) {
  try {
    const review = await getAdminEntityReview("ORGANIZATION", organizationId);
    return <AdminReviewCheckbox entityType="ORGANIZATION" entityId={organizationId}
      initialReviewed={review.reviewed} initialReviewedAt={review.reviewedAt} showDate />;
  } catch {
    return <span role="status">Stav redakčnej kontroly sa nepodarilo načítať.</span>;
  }
}

async function OrganizationDuplicateWarning({ organizationId }: { organizationId: number }) {
  try {
    const warning = await getCanonicalDraftDuplicateWarning("ORGANIZATION", organizationId);
    return <AdminCanonicalDraftWarning warning={warning} />;
  } catch {
    return <p role="status">Kontrola duplicít je dočasne nedostupná.</p>;
  }
}

/** Do not show an editable *empty* fundraising list if its source fails. */
async function OrganizationFundraisingPanel({ organization }: { organization: OrganizationPublicationAdminItem }) {
  try {
    const methods = await listOrganizationFundraisingMethodsAdmin(organization.id);
    return <AdminOrganizationFundraising organization={organization} initialMethods={methods} />;
  } catch {
    return <p role="alert" className="admin-panel">Fundraising sa nepodarilo načítať. Existujúce údaje zostávajú zachované, úpravy tohto panelu sú dočasne nedostupné.</p>;
  }
}

function organizationSuggestions(organizationId: number): Promise<OrganizationSuggestionsResult> {
  return listCanonicalAutomationUpdateSuggestions({
    entityType: "ORGANIZATION",
    canonicalEntityId: organizationId,
  }).then((suggestions) => ({ suggestions, failed: false }))
    .catch(() => ({ suggestions: [], failed: true }));
}

export default async function OrganizationAdminDetailPage({ params }: Props) {
  const { id } = await params;
  const organizationId = Number(id);
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) notFound();
  const user = await requireAdminPageUser("/admin/organizacie/" + id);

  // Only the canonical profile and verified location state are required to
  // initialize an editable form. Never silently substitute an empty address.
  const [organization, locations] = await Promise.all([
    getOrganizationPublicationAdminById(organizationId),
    listOrganizationLocationsAdmin(organizationId),
  ]);
  if (!organization) notFound();

  // Start the non-essential request without awaiting it. React 19 Suspense
  // streams its panel when ready; failure never rejects the editor's render.
  const suggestionsPromise = organizationSuggestions(organizationId);

  return <AdminShell recordId={organizationId}
    user={user}
    eyebrow="Organizácie · Detail"
    title={organization.name}
    description="Canonical údaje, jedna adresa, Google Maps a fundraising na jednom admin detaile."
    actions={<>
      <Suspense fallback={<span role="status">Načítavam redakčné overenie…</span>}>
        <OrganizationReviewAction organizationId={organization.id} />
      </Suspense>
      {organization.status === "PUBLISHED" && organization.slug && <Link href={"/organizacie/" + organization.slug} target="_blank" rel="noreferrer">Otvoriť verejný profil ↗</Link>}
      <Link href="/admin/organizacie">← Späť na organizácie</Link>
    </>}>
    <AdminGeminiOriginBadge agenda="organizations" entityId={organization.id} />
    <Suspense fallback={null}><OrganizationDuplicateWarning organizationId={organization.id} /></Suspense>
    <AdminOrganizationEditor organization={organization} initialLocations={locations}
      automationSuggestionsPromise={suggestionsPromise} />
    <div id="fundraising">
      <Suspense fallback={<p role="status" className="admin-panel">Načítavam fundraising…</p>}>
        <OrganizationFundraisingPanel organization={organization} />
      </Suspense>
    </div>
    {organization.status === "DRAFT" && <AdminCanonicalDraftDelete entityType="ORGANIZATION" canonicalEntityId={organization.id} returnHref="/admin/organizacie" />}
  </AdminShell>;
}
