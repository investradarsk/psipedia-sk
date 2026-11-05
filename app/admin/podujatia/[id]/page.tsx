import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AdminEventEditor } from "@/components/admin-event-editor";
import { AdminReviewCheckbox } from "@/components/admin-review-checkbox";
import { AdminCanonicalDraftWarning } from "@/components/admin-canonical-draft-warning";
import { AdminGeminiOriginBadge } from "@/components/admin-gemini-origin-badge";
import { AdminCanonicalDraftDelete } from "@/components/admin-canonical-draft-delete";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getAdminEntityReview } from "@/lib/admin-entity-review-store";
import { eventHref } from "@/lib/events";
import { getManagedEventById } from "@/lib/event-store";
import { getCanonicalDraftDuplicateWarning } from "@/lib/canonical-draft-flags";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

async function EventReviewAction({ id }: { id: number }) {
  const review = await getAdminEntityReview("EVENT", id);
  return <AdminReviewCheckbox entityType="EVENT" entityId={id}
    initialReviewed={review.reviewed} initialReviewedAt={review.reviewedAt} showDate />;
}

async function EventDuplicateWarning({ id }: { id: number }) {
  const warning = await getCanonicalDraftDuplicateWarning("EVENT", id).catch(() => null);
  return <AdminCanonicalDraftWarning warning={warning} />;
}

export default async function EditEventPage({ params }: Props) {
  const { id } = await params;
  const numericId = Number.parseInt(id, 10);
  if (!Number.isSafeInteger(numericId) || numericId < 1) notFound();
  const user = await requireAdminPageUser(`/admin/podujatia/${id}`);

  // The canonical event is the only read that may block the actual editor.
  // Review state, duplicate detection and automation proposals are auxiliary.
  const event = await getManagedEventById(numericId);
  if (!event) notFound();

  return <AdminShell user={user}
    eyebrow={event.status === "published" ? "Publikované podujatie" : "Rozpracovaný koncept"}
    title="Upraviť podujatie"
    description="Zmeny ulož ako koncept alebo ich rovno publikuj v kalendári."
    actions={<>
      <Suspense fallback={null}><EventReviewAction id={event.id} /></Suspense>
      {event.status === "published" && <Link href={eventHref(event)} target="_blank" rel="noreferrer">Otvoriť verejné podujatie ↗</Link>}
    </>}>
    <AdminGeminiOriginBadge agenda="events" entityId={event.id} />
    <Suspense fallback={null}><EventDuplicateWarning id={event.id} /></Suspense>
    <AdminEventEditor event={event} />
    {event.status === "draft" && <AdminCanonicalDraftDelete entityType="EVENT" canonicalEntityId={event.id} returnHref="/admin/podujatia" />}
  </AdminShell>;
}
