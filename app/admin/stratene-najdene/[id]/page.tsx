import { AdminPartnerCanonicalAudit } from "@/components/admin-partner-canonical-audit";
import { Suspense } from "react";
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
import { getLostFoundPublicSubmissionProvenance } from "@/lib/lost-found-public-moderation";
import { LOST_FOUND_PUBLIC_SOURCE } from "@/lib/lost-found-public-submission";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getAdminDogReport, listPublishedBreedOptions } from "@/lib/lost-found-dog-store";
import { dogReportHref, dogReportStatusLabel, dogReportTypeLabel } from "@/lib/lost-found-dogs";
import { getCanonicalDraftDuplicateWarning } from "@/lib/canonical-draft-flags";
import { listCanonicalAutomationUpdateSuggestions } from "@/lib/data-automation-update-review";
export const dynamic="force-dynamic";type Props={params:Promise<{id:string}>;searchParams:Promise<{returnTo?:string|string[]}>};
export default async function EditLostFoundReportPage({params,searchParams}:Props){const returnHref=adminReturnHref((await searchParams).returnTo,["/admin/stratene-najdene","/admin/pomoc-psom", "/admin/kvalita/seo"]);const {id}=await params;const numericId=parseInt(id,10);if(!Number.isSafeInteger(numericId)||numericId<1)notFound();const user=await requireAdminPageUser(`/admin/stratene-najdene/${id}`);const [report,breeds]=await Promise.all([getAdminDogReport(numericId),listPublishedBreedOptions()]);if(!report)notFound();const [duplicateWarning,automationSuggestions]=await Promise.all([getCanonicalDraftDuplicateWarning("LOST_FOUND",report.id).catch(()=>null),listCanonicalAutomationUpdateSuggestions({entityType:"LOST_FOUND",canonicalEntityId:report.id})]);const publicSubmission = report.source === LOST_FOUND_PUBLIC_SOURCE
  ? await getLostFoundPublicSubmissionProvenance(report.id).catch(() => null)
  : null;
const publicVisible=Boolean(report.publishedAt)&&["ACTIVE","RESOLVED","EXPIRED","ARCHIVED"].includes(report.status);return <AdminShell recordId={report.id} user={user} eyebrow={`${dogReportTypeLabel(report.type)} · ${dogReportStatusLabel[report.status]}`} title={report.dogName||report.breed||`Hlásenie #${report.id}`} description="Editácia záznamu, osobných kontaktov, verejnej lokality, stavu a duplicít." actions={<><AdminPartnerReviewStatus entityType="LOST_FOUND" entityId={report.id} />{publicVisible&&<Link href={dogReportHref(report)} target="_blank" rel="noreferrer">Otvoriť verejné hlásenie ↗</Link>}<Link href={returnHref}>{returnHref.startsWith("/admin/kvalita/seo?") ? "← Späť na SEO audit" : "← Späť na stratené / nájdené"}</Link></>}><Suspense fallback={null}><AdminPartnerCanonicalDraft resourceType="LOST_FOUND_DOG" canonicalId={report.id} /></Suspense><Suspense fallback={null}><AdminPartnerCanonicalAudit resourceType="LOST_FOUND_DOG" canonicalId={report.id} /></Suspense><AdminGeminiOriginBadge agenda="lost-found" entityId={report.id} />
{report.source === LOST_FOUND_PUBLIC_SOURCE && (
  <section className="admin-panel" aria-label="Pôvod verejného hlásenia" data-lost-found-public-provenance>
    <h2>Prijaté cez verejný formulár</h2>
    <p>Hlásenie #{report.id} bolo odoslané návštevníkom. Údaje psa a súkromný kontakt sú v editore nižšie. Schválenie samo osebe nevytvára Partner účet.</p>
    {publicSubmission ? (
      <p>Podanie: {publicSubmission.id} · Stav moderácie: {publicSubmission.status} · Prijaté: {publicSubmission.createdAt}{publicSubmission.reviewedAt ? ` · Rozhodnuté: ${publicSubmission.reviewedAt}` : ""}</p>
    ) : <p>Samostatný záznam moderácie nie je dostupný. Hlásenie zostáva v Admine zachované.</p>}
    <p><Link href="/admin/operations?view=history&source=MODERATION_SUBMISSION#centrum-pozornosti">História moderácie</Link></p>
  </section>
)}<AdminCanonicalDraftWarning warning={duplicateWarning} /><AdminLostFoundEditor report={report} breeds={breeds} automationSuggestions={automationSuggestions} returnHref={returnHref}/>{report.status === "DRAFT" && <AdminCanonicalDraftDelete entityType="LOST_FOUND" canonicalEntityId={report.id} returnHref={returnHref} />}</AdminShell>}
