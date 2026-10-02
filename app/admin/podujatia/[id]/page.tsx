import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminEventEditor } from "@/components/admin-event-editor";
import { AdminReviewCheckbox } from "@/components/admin-review-checkbox";
import { AdminCanonicalDraftWarning } from "@/components/admin-canonical-draft-warning";
import { AdminCanonicalDraftDelete } from "@/components/admin-canonical-draft-delete";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getAdminEntityReview } from "@/lib/admin-entity-review-store";
import { eventHref } from "@/lib/events";
import { getManagedEventById } from "@/lib/event-store";
import { getCanonicalDraftDuplicateWarning } from "@/lib/canonical-draft-flags";
import { listCanonicalAutomationUpdateSuggestions } from "@/lib/data-automation-update-review";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export default async function EditEventPage({ params }: Props) {
  const { id } = await params;
  const numericId = Number.parseInt(id, 10);
  if (!Number.isSafeInteger(numericId) || numericId < 1) notFound();
  const user = await requireAdminPageUser(`/admin/podujatia/${id}`);
  const event = await getManagedEventById(numericId);
  if (!event) notFound();
  const [duplicateWarning, automationSuggestions, review] = await Promise.all([
    getCanonicalDraftDuplicateWarning("EVENT", event.id).catch(() => null),
    listCanonicalAutomationUpdateSuggestions({ entityType: "EVENT", canonicalEntityId: event.id }),
    getAdminEntityReview("EVENT", event.id),
  ]);
  return <AdminShell user={user} eyebrow={event.status === "published" ? "Publikované podujatie" : "Rozpracovaný koncept"} title="Upraviť podujatie" description="Zmeny ulož ako koncept alebo ich rovno publikuj v kalendári." actions={<>
    <AdminReviewCheckbox entityType="EVENT" entityId={event.id} initialReviewed={review.reviewed} initialReviewedAt={review.reviewedAt} showDate />
    {event.status === "published" && <Link href={eventHref(event)} target="_blank" rel="noreferrer">Otvoriť verejné podujatie ↗</Link>}
    <Link href="/admin/podujatia">← Späť na podujatia</Link>
  </>}><AdminCanonicalDraftWarning warning={duplicateWarning} /><AdminEventEditor event={event} automationSuggestions={automationSuggestions} />{event.status === "draft" && <AdminCanonicalDraftDelete entityType="EVENT" canonicalEntityId={event.id} returnHref="/admin/podujatia" />}</AdminShell>;
}
