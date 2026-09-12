import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getNewDirectoryInquiryCount } from "@/lib/directory-inquiry-store";

export const dynamic = "force-dynamic";

export default async function AdminInquiriesPage() {
  const user = await requireAdminPageUser("/admin/dopyty");
  const newInquiryCount = await getNewDirectoryInquiryCount();
  return <AdminShell user={user} eyebrow="Kontakty cez Psipediu" title="Prijaté dopyty" description="Správy od návštevníkov zostávajú v redakcii, kým ich nevybavíš alebo nevymažeš." newInquiryCount={newInquiryCount}><div data-inquiry-dashboard-debug="omitted" /></AdminShell>;
}
