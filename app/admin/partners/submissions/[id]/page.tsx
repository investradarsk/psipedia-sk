import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { AdminPartnerNewProfileActions, AdminPartnerNewProfileCandidateLinkButton } from "@/components/admin-partner-new-profile-actions";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getPartnerNewProfileAdmin } from "@/lib/partner-new-profile-admin";
import "../../partners.css";

export const dynamic="force-dynamic";

function value(value: unknown){
  if(Array.isArray(value))return value.join(", ")||"—";
  if(typeof value==="boolean")return value?"Áno":"Nie";
  if(value===null||value===undefined||value==="")return "—";
  return String(value);
}
const labels:Record<string,string>={
  name:"Názov",category:"Kategória",type:"Typ organizácie",legalName:"Právny názov",registrationNumber:"Registračné číslo",
  excerpt:"Krátky popis",shortDescription:"Krátky popis",description:"Popis",services:"Služby",qualifications:"Kvalifikácie",
  city:"Mesto",district:"Okres",region:"Kraj",address:"Adresa",countryCode:"Krajina",online:"Online služby",priceNote:"Poznámka k cene",
  websiteUrl:"Web",publicPhone:"Verejný telefón",publicEmail:"Verejný e-mail",facebookUrl:"Facebook",instagramUrl:"Instagram",
};

export default async function Page({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const user=await requireAdminPageUser(`/admin/partners/submissions/${id}`);
  const submission=await getPartnerNewProfileAdmin(id);
  if(!submission)notFound();
  const fields=Object.entries(submission.proposedProfile.values);
  return <AdminShell user={user} eyebrow="Partner — nový profil" title={submission.displayName} description={`${submission.statusLabel} · ${submission.resourceType} · duplicate ${submission.duplicateConfidence}`}>
    <div className="admin-partner-detail">
      <section className="admin-form-card"><h2>Partner</h2><p>{submission.email}</p><Link href={`/admin/partners/accounts/${submission.accountId}`}>Partner účet →</Link></section>
      <section className="admin-form-card"><h2>Moderation</h2><p>Status: <strong>{submission.status}</strong></p><p>Typ: {submission.resourceType}</p><p>Kategória / typ: {submission.categoryOrType}</p>{submission.resolutionType?<p>Resolution: <strong>{submission.resolutionType}</strong> · canonical #{submission.resolvedCanonicalId}</p>:null}</section>
    </div>

    <section className="admin-form-card admin-profile-diff">
      <div className="admin-profile-diff-heading"><div><span className="eyebrow">Navrhovaný profil</span><h2>Údaje na vytvorenie</h2></div><p>Čitateľný serverom znovu validovaný payload. System fields, slug, status ani publication tu Partner nenastavuje.</p></div>
      <div className="admin-profile-diff-list">{fields.map(([key,fieldValue])=><article key={key}><h3>{labels[key]??key}</h3><pre>{value(fieldValue)}</pre></article>)}</div>
    </section>

    <section className="admin-form-card">
      <div className="admin-profile-diff-heading"><div><span className="eyebrow">Duplicate scan</span><h2>Kandidáti</h2></div><p>Confidence: <strong>{submission.duplicateConfidence}</strong></p></div>
      {submission.duplicateCandidates.length?<div className="admin-duplicate-candidates">{submission.duplicateCandidates.map((candidate)=><article key={candidate.resourceType+candidate.canonicalId}>
        <div><strong>{candidate.name}</strong><span>{candidate.confidence} · #{candidate.canonicalId}</span></div>
        <dl><div><dt>Typ / kategória</dt><dd>{candidate.categoryOrType}</dd></div><div><dt>Mesto</dt><dd>{candidate.city||"—"}</dd></div><div><dt>Adresa</dt><dd>{candidate.address||"—"}</dd></div><div><dt>Web</dt><dd>{candidate.websiteUrl||"—"}</dd></div><div><dt>Telefón</dt><dd>{candidate.publicPhone||"—"}</dd></div><div><dt>E-mail</dt><dd>{candidate.publicEmail||"—"}</dd></div></dl>
        <p>{candidate.reasons.join(" · ")}</p>
        <div className="admin-partner-button-row">{candidate.publicHref?<Link href={candidate.publicHref} target="_blank">Verejný profil ↗</Link>:null}{submission.active?<AdminPartnerNewProfileCandidateLinkButton id={submission.id} canonicalId={candidate.canonicalId}/>:null}</div>
      </article>)}</div>:<p>Duplicate scan nenašiel vysvetliteľného kandidáta.</p>}
    </section>

    <section className="admin-form-card"><h2>Moderation history</h2><div className="admin-audit-list">{submission.moderation.length?submission.moderation.map((event)=><article key={String((event as {id?:unknown}).id)}><strong>{String((event as {action?:unknown}).action??"")}</strong><span>{String((event as {fromStatus?:unknown}).fromStatus??"—")} → {String((event as {toStatus?:unknown}).toStatus??"—")}</span><small>{new Date(String((event as {createdAt?:unknown}).createdAt)).toLocaleString("sk-SK")}</small></article>):<p>Bez udalostí.</p>}</div></section>

    {submission.active?<AdminPartnerNewProfileActions id={submission.id} candidateIds={submission.duplicateCandidates.map((candidate)=>candidate.canonicalId)}/>:<section className="admin-form-card"><h2>Výsledok</h2><p>{submission.statusLabel}</p>{submission.rejectionReason?<p>Dôvod: {submission.rejectionReason}</p>:null}</section>}
  </AdminShell>;
}
