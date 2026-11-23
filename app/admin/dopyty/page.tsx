import { AdminInquiryDashboard } from "@/components/admin-inquiry-dashboard";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listDirectoryInquiries } from "@/lib/directory-store";

export const dynamic = "force-dynamic";

export default async function AdminInquiriesPage({searchParams}:{searchParams:Promise<{id?:string|string[]}>}) {
  const user = await requireAdminPageUser("/admin/dopyty");
  const raw=await searchParams;
  const value=typeof raw.id==="string"?Number(raw.id):NaN;
  const focusedId=Number.isSafeInteger(value)&&value>0?value:null;
  return <AdminShell user={user} eyebrow="Kontakty cez Psipediu" title="Prijaté dopyty" description="Správy od návštevníkov zostávajú v redakcii, kým ich nevybavíš alebo nevymažeš."><AdminInquiryDashboard initialInquiries={await listDirectoryInquiries()} initialFocusedId={focusedId} /></AdminShell>;
}