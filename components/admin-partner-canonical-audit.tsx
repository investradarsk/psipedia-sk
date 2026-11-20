import Link from "next/link";
import { env } from "cloudflare:workers";
import { AdminPartnerAuditDiff } from "./admin-partner-audit-diff";
import type { PartnerCanonicalType } from "@/lib/partner-canonical-workflow";

const cols={
  DIRECTORY_PROFILE:"directory_profile_id",HELP_ORGANIZATION:"help_organization_id",
  MANAGED_EVENT:"managed_event_id",
} as const;

export async function AdminPartnerCanonicalAudit({resourceType,canonicalId}:{
  resourceType:PartnerCanonicalType;canonicalId:number;
}){
  const database=(env as unknown as {DB?:D1Database}).DB;
  if(!database||!Number.isSafeInteger(canonicalId)||canonicalId<1)return null;
  let targetId:string|null=null,targetType="PARTNER_RESOURCE";
  if(resourceType in cols){
    const col=cols[resourceType as keyof typeof cols];
    try {
      const res=await database.prepare("SELECT id FROM partner_resources WHERE "+col+"=? LIMIT 1")
        .bind(canonicalId).first<{id:string}>();
      targetId=res?.id??null;
    } catch { return <p role="status">História partnerských úprav sa momentálne nepodarila načítať.</p>; }
  }else{
    targetType="PARTNER_HELP_CLAIM";
    targetId="help-record-"+resourceType+"-"+canonicalId;
  }
  if(!targetId)return null;
  let data:D1Result<{id:string;actorRef:string;createdAt:string;metadataJson:string}>;
  try {
    data=await database.prepare(
      "SELECT id,actor_ref actorRef,created_at createdAt,metadata_json metadataJson "+
      "FROM partner_audit_events WHERE target_type=? AND target_id=? "+
      "AND json_valid(metadata_json) "+
      "AND json_extract(metadata_json,'$.mode')='DIRECT_PUBLIC_SAVE' "+
      "ORDER BY created_at DESC,id DESC LIMIT 50"
    ).bind(targetType,targetId).all<{id:string;actorRef:string;createdAt:string;metadataJson:string}>();
  } catch { return <p role="status">História partnerských úprav sa momentálne nepodarila načítať.</p>; }
  if(data.results.length===0)return null;
  return <section className="admin-form-card admin-partner-v2-panel" aria-label="História partnerských úprav">
    <div className="admin-partner-v2-panel-heading">
      <h2>História partnerských úprav</h2>
      <span>Posledných {data.results.length} zápisov</span>
    </div>
    <div className="admin-partner-v2-records">
      {data.results.map(item=><article key={item.id}>
        <div>
          <h3>Úprava verejného profilu</h3>
          <p>{new Date(item.createdAt).toLocaleString("sk-SK")}</p>
          {item.actorRef.startsWith("partner:")?
            <Link href={"/admin/partners/accounts/"+encodeURIComponent(item.actorRef.slice(8))+"?tab=historia"}>
              Otvoriť partnera
            </Link>:<small>{item.actorRef}</small>}
          <AdminPartnerAuditDiff metadataJson={item.metadataJson}/>
        </div>
      </article>)}
    </div>
    <p>História je len na čítanie. Zmeny sa nevracajú automaticky.</p>
  </section>;
}
