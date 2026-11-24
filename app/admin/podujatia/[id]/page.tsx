import { AdminPartnerCanonicalAudit } from "@/components/admin-partner-canonical-audit";
import Link from "next/link";
import { adminReturnHref } from "@/lib/admin-return-navigation";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AdminEventEditor } from "@/components/admin-event-editor";
import { AdminPartnerReviewStatus } from "@/components/admin-partner-review-status";
import { AdminCanonicalDraftWarning } from "@/components/admin-canonical-draft-warning";
import { AdminGeminiOriginBadge } from "@/components/admin-gemini-origin-badge";
import { AdminPartnerCanonicalDraft } from "@/components/admin-partner-canonical-draft";
import { AdminCanonicalDraftDelete } from "@/components/admin-canonical-draft-delete";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { eventHref } from "@/lib/events";
import { getManagedEventById, getManagedEventInternalNotesById } from "@/lib/event-store";
import { getCanonicalDraftDuplicateWarning } from "@/lib/canonical-draft-flags";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ returnTo?: string | string[] }> };

async function EventReviewAction({ id }: { id: number }) {
  return <AdminPartnerReviewStatus entityType="EVENT" entityId={id} />;
}

async function EventDuplicateWarning({ id }: { id: number }) {
  const warning = await getCanonicalDraftDuplicateWarning("EVENT", id).catch(() => null);
  return <AdminCanonicalDraftWarning warning={warning} />;
}

export default async function EditEventPage({ params, searchParams }: Props) {
  const returnHref = adminReturnHref((await searchParams).returnTo, ["/admin/podujatia", "/admin/kvalita/seo"]);
  const { id } = await params;
  const numericId = Number.parseInt(id, 10);
  if (!Number.isSafeInteger(numericId) || numericId < 1) notFound();
  const user = await requireAdminPageUser(`/admin/podujatia/${id}`);

  // The canonical event is the only read that may block the actual editor.
  // Review state, duplicate detection and automation proposals are auxiliary.
  const event = await getManagedEventById(numericId);
  if (!event) notFound();

  return <AdminShell recordId={event.id} user={user}
    eyebrow={event.status === "published" ? "Publikované podujatie" : "Rozpracovaný koncept"}
    title="Upraviť podujatie"
    description="Zmeny ulož ako koncept alebo ich rovno publikuj v kalendári."
    actions={<>
      <Suspense fallback={null}><EventReviewAction id={event.id} /></Suspense>
      {event.status === "published" && <Link href={eventHref(event)} target="_blank" rel="noreferrer">Otvoriť verejné podujatie ↗</Link>}
    </>}>
    <Suspense fallback={null}><AdminPartnerCanonicalDraft resourceType="MANAGED_EVENT" canonicalId={event.id} /></Suspense><Suspense fallback={null}><AdminPartnerCanonicalAudit resourceType="MANAGED_EVENT" canonicalId={event.id} /></Suspense><AdminGeminiOriginBadge agenda="events" entityId={event.id} />
    <Suspense fallback={null}><EventDuplicateWarning id={event.id} /></Suspense>
    <AdminEventEditor event={event} initialInternalNotes={await getManagedEventInternalNotesById(event.id)} returnHref={returnHref} />
    {event.status === "draft" && <AdminCanonicalDraftDelete entityType="EVENT" canonicalEntityId={event.id} returnHref={returnHref} />}
  </AdminShell>;
}
