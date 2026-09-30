import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminLostFoundEditor } from "@/components/admin-lost-found-editor";
import { AdminReviewCheckbox } from "@/components/admin-review-checkbox";
import { AdminCanonicalDraftWarning } from "@/components/admin-canonical-draft-warning";
import { AdminCanonicalDraftDelete } from "@/components/admin-canonical-draft-delete";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getAdminEntityReview } from "@/lib/admin-entity-review-store";
import { getAdminDogReport, listPublishedBreedOptions } from "@/lib/lost-found-dog-store";
import { dogReportHref, dogReportStatusLabel, dogReportTypeLabel } from "@/lib/lost-found-dogs";
import { getCanonicalDraftDuplicateWarning } from "@/lib/canonical-draft-flags";
import { listCanonicalAutomationUpdateSuggestions } from "@/lib/data-automation-update-review";
export const dynamic="force-dynamic";type Props={params:Promise<{id:string}>};
export default async function EditLostFoundReportPage({params}:Props){const {id}=await params;const numericId=parseInt(id,10);if(!Number.isSafeInteger(numericId)||numericId<1)notFound();const user=await requireAdminPageUser(`/admin/stratene-najdene/${id}`);const [report,breeds]=await Promise.all([getAdminDogReport(numericId),listPublishedBreedOptions()]);if(!report)notFound();const [duplicateWarning,automationSuggestions,review]=await Promise.all([getCanonicalDraftDuplicateWarning("LOST_FOUND",report.id).catch(()=>null),listCanonicalAutomationUpdateSuggestions({entityType:"LOST_FOUND",canonicalEntityId:report.id}),getAdminEntityReview("LOST_FOUND",report.id)]);const publicVisible=Boolean(report.publishedAt)&&["ACTIVE","RESOLVED","EXPIRED","ARCHIVED"].includes(report.status);return <AdminShell user={user} eyebrow={`${dogReportTypeLabel(report.type)} · ${dogReportStatusLabel[report.status]}`} title={report.dogName||report.breed||`Hlásenie #${report.id}`} description="Editácia záznamu, osobných kontaktov, verejnej lokality, stavu a duplicít." actions={<><AdminReviewCheckbox entityType="LOST_FOUND" entityId={report.id} initialReviewed={review.reviewed} initialReviewedAt={review.reviewedAt} showDate />{publicVisible&&<Link href={dogReportHref(report)} target="_blank" rel="noreferrer">Otvoriť verejné hlásenie ↗</Link>}<Link href="/admin/stratene-najdene">← Späť na stratené / nájdené</Link></>}><AdminCanonicalDraftWarning warning={duplicateWarning}/><AdminLostFoundEditor report={report} breeds={breeds} automationSuggestions={automationSuggestions}/>{report.status === "DRAFT" && <AdminCanonicalDraftDelete entityType="LOST_FOUND" canonicalEntityId={report.id} returnHref="/admin/stratene-najdene" />}</AdminShell>}
