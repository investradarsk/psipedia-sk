import {FacebookImageConflict} from "@/lib/facebook-image-store";

/** The tombstone, canonical Notion identity, Meta ID, media and attempt ledger are
 * deliberately retained to prevent resurrection or repeated Meta publishing.
 * The operation is irreversible through user-facing APIs (no restore endpoint).
 */
export async function facebookTrashSchemaReady(db:Pick<D1Database,"prepare">):Promise<boolean> {
  try {
    await db.prepare("SELECT deleted_at,deleted_by FROM facebook_image_posts LIMIT 0").all();
    return true;
  } catch(error) {
    if(error instanceof Error && /no such column:\s*deleted_at|no such column:\s*deleted_by/i.test(error.message))return false;
    throw error;
  }
}
export class FacebookTrashMigrationNeeded extends Error {
  constructor(){super("Trvalé odstránenie vyžaduje schválenú D1 migráciu 0131.");}
}
export async function permanentlyDeleteFacebookImage(args:{
  db:D1Database;id:string;expectedVersion:number;actor:string;
}) {
  const {db,id,expectedVersion,actor}=args;
  if(!await facebookTrashSchemaReady(db))throw new FacebookTrashMigrationNeeded();
  if(!/^[a-f0-9-]{36}$/i.test(id)||!Number.isSafeInteger(expectedVersion)||expectedVersion<1)
    throw new FacebookImageConflict();
  let consent=false;
  try{await db.prepare("SELECT direct_publish_consent FROM facebook_image_posts LIMIT 0").all();consent=true;}
  catch(error){if(!(error instanceof Error&&/no such column:\s*direct_publish_consent/i.test(error.message)))throw error;}
  const now=new Date().toISOString();
  const sql=`UPDATE facebook_image_posts SET deleted_at=?,deleted_by=?,
      approval_status='UNREVIEWED',approved_at=NULL,approved_by=NULL,
      ${consent?"direct_publish_consent=0,direct_consent_at=NULL,direct_consent_by=NULL,":""}
      version=version+1,updated_at=?,updated_by=?
      WHERE id=? AND version=? AND deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM facebook_image_publish_attempts a
          WHERE a.post_id=facebook_image_posts.id AND a.state='SENDING')
      RETURNING id,version`;
  const result=await db.prepare(sql).bind(now,actor,now,actor,id,expectedVersion)
    .first<{id:string;version:number}>();
  if(!result)throw new FacebookImageConflict();
  return result;
}
