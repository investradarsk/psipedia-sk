import { AdminPartnerCanonicalAudit } from "@/components/admin-partner-canonical-audit";
import Link from "next/link";
import { adminReturnHref } from "@/lib/admin-return-navigation";
import { notFound } from "next/navigation";
import { AdminLostFoundEditor } from "@/components/admin-lost-found-editor";
import { AdminPartnerReviewStatus } from "@/components/admin-partner-review-status";
import { AdminCanonicalDraftWarning } from "@/components/admin-canonical-draft-warning";
import { AdminGeminiOriginBadge } from "@/components/admin-gemini-origin-badge";
import { AdminPartnerCanonicalDraft } from "@/components/admin-partner-canonical-draft";
import { AdminCanonicalDraftDelete } from "@/components/admin-canonical-draft-delete";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getAdminDogReport, listPublishedBreedOptions } from "@/lib/lost-found-dog-store";
import { dogReportHref, dogReportStatusLabel, dogReportTypeLabel } from "@/lib/lost-found-dogs";
import { getCanonicalDraftDuplicateWarning } from "@/lib/canonical-draft-flags";
import { listCanonicalAutomationUpdateSuggestions } from "@/lib/data-automation-update-review";
export const dynamic="force-dynamic";type Props={params:Promise<{id:string}>;searchParams:Promise<{returnTo?:string|string[]}>};
export default async function EditLostFoundReportPage({params,searchParams}:Props){const returnHref=adminReturnHref((await searchParams).returnTo,["/admin/stratene-najdene","/admin/pomoc-psom"]);const {id}=await params;const numericId=parseInt(id,10);if(!Number.isSafeInteger(numericId)||numericId<1)notFound();const user=await requireAdminPageUser(`/admin/stratene-najdene/${id}`);const [report,breeds]=await Promise.all([getAdminDogReport(numericId),listPublishedBreedOptions()]);if(!report)notFound();const [duplicateWarning,automationSuggestions]=await Promise.all([getCanonicalDraftDuplicateWarning("LOST_FOUND",report.id).catch(()=>null),listCanonicalAutomationUpdateSuggestions({entityType:"LOST_FOUND",canonicalEntityId:report.id})]);const publicVisible=Boolean(report.publishedAt)&&["ACTIVE","RESOLVED","EXPIRED","ARCHIVED"].includes(report.status);return <AdminShell recordId={report.id} user={user} eyebrow={`${dogReportTypeLabel(report.type)} · ${dogReportStatusLabel[report.status]}`} title={report.dogName||report.breed||`Hlásenie #${report.id}`} description="Editácia záznamu, osobných kontaktov, verejnej lokality, stavu a duplicít." actions={<><AdminPartnerReviewStatus entityType="LOST_FOUND" entityId={report.id} />{publicVisible&&<Link href={dogReportHref(report)} target="_blank" rel="noreferrer">Otvoriť verejné hlásenie ↗</Link>}<Link href={returnHref}>← Späť na stratené / nájdené</Link></>}><AdminPartnerCanonicalDraft resourceType="LOST_FOUND_DOG" canonicalId={report.id} /><AdminPartnerCanonicalAudit resourceType="LOST_FOUND_DOG" canonicalId={report.id} /><AdminGeminiOriginBadge agenda="lost-found" entityId={report.id} /><AdminCanonicalDraftWarning warning={duplicateWarning} /><AdminLostFoundEditor report={report} breeds={breeds} automationSuggestions={automationSuggestions} returnHref={returnHref}/>{report.status === "DRAFT" && <AdminCanonicalDraftDelete entityType="LOST_FOUND" canonicalEntityId={report.id} returnHref={returnHref} />}</AdminShell>}
