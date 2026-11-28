import Link from "next/link";
import { env } from "cloudflare:workers";
import { AdminReviewCheckbox } from "./admin-review-checkbox";
import { getAdminEntityReview, type AdminReviewEntityType } from "@/lib/admin-entity-review-store";
import { getAdminReviewPartnerOwner } from "@/lib/admin-partner-review-owner";

function skDate(value:string){
  const date=new Date(value);
  return Number.isNaN(date.getTime())?"nezistený":
    new Intl.DateTimeFormat("sk-SK",{dateStyle:"medium",timeZone:"Europe/Bratislava"}).format(date);
}

/** Existing review checkbox + its true Partner/D1 owner. Admin-only. */
export async function AdminPartnerReviewStatus({entityType,entityId}:{
  entityType:AdminReviewEntityType;entityId:number;
}){
  const bindings=env as unknown as {DB?:D1Database;PII_ENCRYPTION_KEY?:string};
  if(!bindings.DB)return <span role="alert">Stav Odkontrolované sa nepodarilo overiť.</span>;
  let review:Awaited<ReturnType<typeof getAdminEntityReview>>;
  let owner:Awaited<ReturnType<typeof getAdminReviewPartnerOwner>>;
  try{
    [review,owner]=await Promise.all([
      getAdminEntityReview(entityType,entityId,bindings.DB),
      getAdminReviewPartnerOwner({
        database:bindings.DB,type:entityType,entityId,
        encryptionKey:bindings.PII_ENCRYPTION_KEY??"",
      }),
    ]);
  }catch(error){
    console.error("ADMIN_PARTNER_REVIEW_STATUS_UNAVAILABLE",entityType,entityId,
      error instanceof Error?error.message:"UNKNOWN");
    return <span role="alert">Správcu a stav kontroly sa nepodarilo overiť. Odomknutie je nedostupné.</span>;
  }
  return <div style={{display:"grid",gap:"0.35rem",maxWidth:"30rem"}}>
    <AdminReviewCheckbox key={String(review.reviewed)+review.reviewedAt+String(Boolean(owner))} entityType={entityType} entityId={entityId}
      initialReviewed={review.reviewed||Boolean(owner)}
      initialReviewedAt={review.reviewedAt||owner?.grantedAt}
      lockedByPartner={Boolean(owner)} showDate />
    {owner&&<div role="status" style={{fontSize:"0.8rem",lineHeight:"1.4",padding:"0.45rem 0.65rem",
      border:"1px solid #cad8d1",borderRadius:"0.6rem",background:"#f7f9f6",color:"#254b3c"}}>
      <strong>Tento záznam spravuje partner</strong>
      <div>Správca: <Link href={`/admin/partners/accounts/${owner.accountId}`}>{owner.email}</Link></div>
      <div>Prístup od: {skDate(owner.grantedAt)}</div>
      {owner.accountStatus!=="ACTIVE"&&<div>Stav účtu: {owner.accountStatus}</div>}
      <div>Synchronizácia s Notionom je uzamknutá v oboch smeroch.</div>
      <small>Po odobratí partnera zostane Odkontrolované zapnuté, kým ho ručne nezrušíš.</small>
    </div>}
  </div>;
}
