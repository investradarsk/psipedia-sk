/**
 * Reuses the site's existing Resend provider, encrypted Partner email and
 * scheduled outbox sweep. Only a generic notice is emailed (never message text).
 */
import { env } from "cloudflare:workers";
import { SITE_URL } from "@/config/public-site";
import { getPartnerDatabase } from "./partner-auth-store";
import { decryptPii } from "./pii-crypto";

type Bindings={DB?:D1Database;RESEND_API_KEY?:string;PARTNER_FROM_EMAIL?:string;
  EDITORIAL_FROM_EMAIL?:string;PII_ENCRYPTION_KEY?:string};
type Item={messageId:string;accountId:string;emailCiphertext:string;status:string;attempts:number;
  emailEnabled:number;accountStatus:string};
const MAX=5;
export async function runPartnerChatEmailSweep(options:{database?:D1Database;bindings?:Bindings;now?:Date}={}){
  const runtime=options.bindings??env as unknown as Bindings;
  const db=getPartnerDatabase(options.database??runtime.DB),now=options.now??new Date(),iso=now.toISOString();
  const stale=new Date(now.getTime()-300000).toISOString();
  const rows=await db.prepare(
    "SELECT q.message_id messageId,q.partner_account_id accountId,a.email_ciphertext emailCiphertext,"+
    "q.status,q.attempts,a.status accountStatus,COALESCE(p.email_enabled,1) emailEnabled "+
    "FROM partner_chat_email_queue q JOIN partner_accounts a ON a.id=q.partner_account_id "+
    "LEFT JOIN partner_notification_preferences p ON p.partner_account_id=q.partner_account_id "+
    "WHERE q.attempts<5 AND (q.status IN ('PENDING','FAILED') "+
    "OR (q.status='SENDING' AND (q.last_attempt_at IS NULL OR q.last_attempt_at<?))) "+
    "ORDER BY q.created_at LIMIT 25"
  ).bind(stale).all<Item>();
  const summary={candidates:rows.results.length,sent:0,failed:0,expired:0,skipped:0};
  for(const row of rows.results){
    if(row.emailEnabled!==1||row.accountStatus!=="ACTIVE"){
      await db.prepare("UPDATE partner_chat_email_queue SET status='EXPIRED',updated_at=? "+
        "WHERE message_id=? AND status IN ('PENDING','FAILED','SENDING')")
        .bind(iso,row.messageId).run();
      summary.expired++;continue;
    }
    const claim=await db.prepare("UPDATE partner_chat_email_queue SET status='SENDING',"+
      "attempts=attempts+1,last_attempt_at=?,updated_at=? WHERE message_id=? "+
      "AND attempts<5 AND (status IN ('PENDING','FAILED') OR "+
      "(status='SENDING' AND (last_attempt_at IS NULL OR last_attempt_at<?))) "+
      "RETURNING message_id messageId")
      .bind(iso,iso,row.messageId,stale).first<{messageId:string}>();
    if(!claim){summary.skipped++;continue;}
    let failure:string|null=null,providerId:string|null=null;
    const key=runtime.RESEND_API_KEY?.trim(),from=runtime.PARTNER_FROM_EMAIL?.trim()||
      runtime.EDITORIAL_FROM_EMAIL?.trim();
    if(!key||!from||!runtime.PII_ENCRYPTION_KEY)failure="partner_chat_email_config_missing";
    else {
      try{
        const recipient=await decryptPii(row.emailCiphertext,runtime.PII_ENCRYPTION_KEY);
        const response=await fetch("https://api.resend.com/emails",{
          method:"POST",
          headers:{authorization:"Bearer "+key,"content-type":"application/json",
            "Idempotency-Key":"partner-chat/"+row.messageId},
          body:JSON.stringify({from,to:recipient,subject:"Nová správa v Partner účte Psipedia",
            text:"Dobrý deň,\n\nv Partner účte Psipedia máte novú súkromnú správu.\n"+
              SITE_URL+"/partner/spravy\n\nObsah správy ani prílohy neposielame e-mailom.\n\nPsipedia.sk"}),
          signal:AbortSignal.timeout(8000),
        });
        if(response.ok){
          try{const json=await response.json() as {id?:string};providerId=json.id??null;}catch{}
        }else failure="resend_http_"+response.status;
      }catch{failure="resend_request_failed";}
    }
    if(failure){
      await db.prepare("UPDATE partner_chat_email_queue SET status=?,last_error=?,updated_at=? "+
        "WHERE message_id=? AND status='SENDING'")
        .bind(row.attempts+1>=MAX?"EXPIRED":"FAILED",failure,iso,row.messageId).run();
      summary.failed++;
    }else{
      await db.prepare("UPDATE partner_chat_email_queue SET status='SENT',sent_at=?,"+
        "provider_message_id=?,last_error=NULL,updated_at=? WHERE message_id=? AND status='SENDING'")
        .bind(iso,providerId,iso,row.messageId).run();
      summary.sent++;
    }
  }
  return summary;
}
