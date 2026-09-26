import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { AdminPossibleMatchReviewActions } from "@/components/admin-possible-match-review-actions";
import styles from "@/components/admin-operations-ux.module.css";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getAutomationPossibleMatchReviewDetail } from "@/lib/data-automation-match-review";
export const dynamic="force-dynamic";
type Props={params:Promise<{observationId:string;candidateClusterId:string}>};
function value(v:unknown){return v==null||v===""?"—":typeof v==="object"?JSON.stringify(v):String(v);}
function side(evidence:Array<{fieldName:string;rawValue:unknown;preferred:boolean;sourceLabel:string;authorityScore:number}>){
  const by=new Map<string,typeof evidence[number]>();
  for(const item of evidence) if(!by.has(item.fieldName)||item.preferred) by.set(item.fieldName,item);
  return by;
}
export default async function PossibleMatchDetail({params}:Props){
  const raw=await params; await requireAdminPageUser(`/admin/operations/possible-matches/${raw.observationId}/${raw.candidateClusterId}`);
  const observationId=Number.parseInt(raw.observationId,10),candidateClusterId=Number.parseInt(raw.candidateClusterId,10);
  if(!Number.isSafeInteger(observationId)||!Number.isSafeInteger(candidateClusterId)) notFound();
  const review=await getAutomationPossibleMatchReviewDetail(observationId,candidateClusterId); if(!review) notFound();
  const left=side(review.sourceEvidence),right=side(review.targetEvidence),fields=Array.from(new Set([...left.keys(),...right.keys()])).sort();
  return <AdminShell user={await requireAdminPageUser("/admin/operations/possible-matches")} eyebrow="POSSIBLE match" title={review.entityType+" identity review"}
    description={review.matchReason} actions={<Link href="/admin/operations/possible-matches">← POSSIBLE queue</Link>}>
    <section className={styles.section}><div className={styles.sectionHeader}><div><h2>Side-by-side</h2><p>Incoming cluster #{review.sourceClusterId} vs candidate cluster #{review.candidateClusterId}</p></div></div>
      <div className="admin-change-table" role="table">
        <div className="is-heading" role="row"><strong>Pole</strong><strong>Incoming</strong><strong>Candidate</strong></div>
        {fields.map(field=><div role="row" key={field}><strong>{field}{review.conflicts.includes(field)?" ⚠":""}</strong><span>{value(left.get(field)?.rawValue)}</span><span>{value(right.get(field)?.rawValue)}</span></div>)}
      </div>
      <p><strong>Semantic kinds:</strong> {review.sourceSemanticKind} ↔ {review.targetSemanticKind} · <strong>source authority:</strong> {review.sourceRole} / {review.sourceAuthority}</p>
      <p><strong>Decisive signals:</strong> {review.decisiveSignals.join(", ")||"žiadne zhodné identity polia"}</p>
      <p><strong>Missing signals:</strong> {review.missingSignals.join(", ")||"žiadne explicitne chýbajúce porovnateľné polia"}</p>
      <p><strong>Conflicts:</strong> {review.conflicts.join(", ")||"žiadne explicitné field conflicts"} · <strong>Evidence fingerprint:</strong> <code>{review.evidenceFingerprint}</code></p>
    </section>
    <AdminPossibleMatchReviewActions observationId={review.observationId} candidateClusterId={review.candidateClusterId}
      evidenceFingerprint={review.evidenceFingerprint} currentDecisionId={review.currentDecision?.id??null} semanticCompatible={review.semanticCompatible}/>
    <section className={styles.section}><h2>Audit history</h2>{review.history.length?review.history.map(item=><p key={item.id}><strong>{item.decision}</strong> · {item.reviewer} · v{item.version} · {item.createdAt}{item.note?" · "+item.note:""}</p>):<p>Zatiaľ bez rozhodnutia.</p>}</section>
  </AdminShell>;
}
