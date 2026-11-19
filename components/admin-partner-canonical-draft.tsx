import Link from "next/link";
import { getPendingPartnerCanonicalDraft, type PartnerCanonicalType } from "@/lib/partner-canonical-workflow";
import { AdminPartnerCanonicalDraftActions } from "./admin-partner-canonical-draft-actions";
import styles from "./admin-partner-canonical-draft.module.css";

/** Displayed only inside the existing canonical Admin editor. */
export async function AdminPartnerCanonicalDraft({
  resourceType,canonicalId,
}:{resourceType:PartnerCanonicalType;canonicalId:number}){
  const draft=await getPendingPartnerCanonicalDraft({resourceType,canonicalId});
  if(!draft)return null;
  const submitted=["SUBMITTED","PENDING_REVIEW","QUARANTINED"].includes(draft.status);
  return (
    <section className={styles.panel} aria-label="Partnerský koncept" data-partner-canonical-draft>
      <div className={styles.heading}>
        <div>
          <h2>Partnerský koncept</h2>
          <p>{draft.status==="DRAFT"?"Partner tento koncept ešte neodoslal.":
            draft.status==="RETURNED"?"Vrátené na doplnenie – partner môže profil opätovne upraviť a odoslať.":
            "Partner odoslal tento profil na prvé schválenie."}</p>
        </div>
        <Link href={"/admin/partners/accounts/"+encodeURIComponent(draft.accountId)+"?tab=ziadosti"}>
          Otvoriť partnera
        </Link>
      </div>
      {submitted&&(
        <AdminPartnerCanonicalDraftActions id={draft.id} canonicalId={canonicalId}
          canonicalUpdatedAt={draft.canonicalUpdatedAt??""} />
      )}
    </section>
  );
}
