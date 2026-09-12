import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminInquiriesPage() {
  const user = await requireAdminPageUser("/admin/dopyty");
  return <AdminShell user={user} eyebrow="Kontakty cez Psipediu" title="Prijaté dopyty" description="Správy od návštevníkov zostávajú v redakcii, kým ich nevybavíš alebo nevymažeš."><div data-inquiry-dashboard-debug="omitted" /></AdminShell>;
}
