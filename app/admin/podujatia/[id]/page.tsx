import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminEventEditor } from "@/components/admin-event-editor";
import { AdminCanonicalDraftWarning } from "@/components/admin-canonical-draft-warning";
import { AdminGeoLocation } from "@/components/admin-geo-location";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
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
  const [duplicateWarning, automationSuggestions] = await Promise.all([
    getCanonicalDraftDuplicateWarning("EVENT", event.id).catch(() => null),
    listCanonicalAutomationUpdateSuggestions({ entityType: "EVENT", canonicalEntityId: event.id }),
  ]);
  return <AdminShell user={user} eyebrow={event.status === "published" ? "Publikované podujatie" : "Rozpracovaný koncept"} title="Upraviť podujatie" description="Zmeny ulož ako koncept alebo ich rovno publikuj v kalendári." actions={<Link href="/admin/podujatia">← Späť na podujatia</Link>}><AdminCanonicalDraftWarning warning={duplicateWarning} /><AdminEventEditor event={event} automationSuggestions={automationSuggestions} /><AdminGeoLocation targetType="MANAGED_EVENT" targetId={event.id} /></AdminShell>;
}
