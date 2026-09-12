import { notFound } from "next/navigation";
import { AdminLostFoundEditor } from "@/components/admin-lost-found-editor";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getAdminDogReport, listPublishedBreedOptions } from "@/lib/lost-found-dog-store";
import { dogReportStatusLabel, dogReportTypeLabel } from "@/lib/lost-found-dogs";
export const dynamic="force-dynamic";type Props={params:Promise<{id:string}>};
export default async function EditLostFoundReportPage({params}:Props){const {id}=await params;const numericId=parseInt(id,10);if(!Number.isSafeInteger(numericId)||numericId<1)notFound();const user=await requireAdminPageUser(`/admin/stratene-najdene/${id}`);const [report,breeds]=await Promise.all([getAdminDogReport(numericId),listPublishedBreedOptions()]);if(!report)notFound();return <AdminShell user={user} eyebrow={`${dogReportTypeLabel(report.type)} · ${dogReportStatusLabel[report.status]}`} title={report.dogName||report.breed||`Hlásenie #${report.id}`} description="Editácia záznamu, osobných kontaktov, verejnej lokality, stavu a duplicít."><AdminLostFoundEditor report={report} breeds={breeds}/></AdminShell>}
