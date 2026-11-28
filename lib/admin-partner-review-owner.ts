import { decryptPii } from "./pii-crypto";
import type { AdminReviewEntityType } from "./admin-entity-review-store";

/** Admin-only: no personal account details ever enter public or partner APIs. */
export async function getAdminReviewPartnerOwner(input:{
  database:D1Database;type:AdminReviewEntityType;entityId:number;encryptionKey:string;
}):Promise<null|{accountId:string;email:string;grantedAt:string;accountStatus:string}>{
  const {database,type,entityId,encryptionKey}=input;
  if(!Number.isSafeInteger(entityId)||entityId<1)throw Error("ADMIN_REVIEW_INVALID_ID");
  if(type==="BREED"||type==="ESHOP")return null;
  const help=({ADOPTION:"adoption_dog_id",LOST_FOUND:"lost_found_report_id",HELP_CASE:"help_case_id"} as const);
  const canonical=({EVENT:"managed_event_id",ORGANIZATION:"help_organization_id"} as const);
  type OwnerRow={accountId:string;emailCiphertext:string;grantedAt:string;accountStatus:string};
  let row:OwnerRow|null=null;
  if(type in help){
    row=await database.prepare(`
      SELECT c.account_id accountId,a.email_ciphertext emailCiphertext,
        COALESCE(c.reviewed_at,c.created_at) grantedAt,a.status accountStatus
      FROM partner_help_claims c
      JOIN partner_accounts a ON a.id=c.account_id
      WHERE c.${help[type as keyof typeof help]}=?1 AND c.status='APPROVED'
      ORDER BY c.reviewed_at DESC LIMIT 1
    `).bind(entityId).first<OwnerRow>();
  }else{
    const col=canonical[type as keyof typeof canonical];
    if(!col)throw Error("ADMIN_REVIEW_UNSUPPORTED_TYPE");
    row=await database.prepare(`
      SELECT m.account_id accountId,a.email_ciphertext emailCiphertext,
        m.created_at grantedAt,a.status accountStatus
      FROM partner_resources r
      JOIN partner_memberships m ON m.resource_id=r.id AND m.revoked_at IS NULL
      JOIN partner_accounts a ON a.id=m.account_id
      WHERE r.${col}=?1 ORDER BY m.created_at DESC LIMIT 1
    `).bind(entityId).first<OwnerRow>();
  }
  if(!row)return null;
  return {accountId:row.accountId,email:await decryptPii(row.emailCiphertext,encryptionKey),
    grantedAt:row.grantedAt,accountStatus:row.accountStatus};
}
