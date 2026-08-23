import { notFound } from "next/navigation";
import { AdminEventEditor } from "@/components/admin-event-editor";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getManagedEventById } from "@/lib/event-store";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export default async function EditEventPage({ params }: Props) {
  const { id } = await params;
  const numericId = Number.parseInt(id, 10);
  if (!Number.isSafeInteger(numericId) || numericId < 1) notFound();
  const user = await requireAdminPageUser(`/admin/podujatia/${id}`);
  const event = await getManagedEventById(numericId);
  if (!event) notFound();
  return <AdminShell user={user} eyebrow={event.status === "published" ? "Publikované podujatie" : "Rozpracovaný koncept"} title="Upraviť podujatie" description="Zmeny ulož ako koncept alebo ich rovno publikuj v kalendári."><AdminEventEditor event={event} /></AdminShell>;
}
