import {FacebookImageConflict} from "@/lib/facebook-image-store";

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
  constructor(){super("Kôš čaká na samostatne schválenú produkčnú migráciu 0131.");}
}
export async function setFacebookImageTrashed(args:{
  db:D1Database;id:string;expectedVersion:number;action:"trash"|"restore";actor:string;
}) {
  const {db,id,expectedVersion,action,actor}=args;
  if(!await facebookTrashSchemaReady(db))throw new FacebookTrashMigrationNeeded();
  if(!/^[a-f0-9-]{36}$/i.test(id)||!Number.isSafeInteger(expectedVersion)||expectedVersion<1)
    throw new FacebookImageConflict();
  const now=new Date().toISOString();
  // CAS ensures two editors cannot race. An in-flight Meta request cannot be hidden.
  // The old post row (including Notion identity) and attempt ledger are NEVER deleted.
  const sql=action==="trash"?
    `UPDATE facebook_image_posts SET deleted_at=?,deleted_by=?,approval_status='UNREVIEWED',
      approved_at=NULL,approved_by=NULL,version=version+1,updated_at=?,updated_by=?
      WHERE id=? AND version=? AND deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM facebook_image_publish_attempts a
          WHERE a.post_id=facebook_image_posts.id AND a.state='SENDING')
      RETURNING id,version`:
    `UPDATE facebook_image_posts SET deleted_at=NULL,deleted_by=NULL,
      status=CASE WHEN status='published' THEN 'published' ELSE 'draft' END,
      approval_status='UNREVIEWED',approved_at=NULL,approved_by=NULL,
      version=version+1,updated_at=?,updated_by=?
      WHERE id=? AND version=? AND deleted_at IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM facebook_image_publish_attempts a
          WHERE a.post_id=facebook_image_posts.id AND a.state='SENDING')
      RETURNING id,version`;
  const result=await db.prepare(sql).bind(...(action==="trash"?
    [now,actor,now,actor,id,expectedVersion]:[now,actor,id,expectedVersion]))
    .first<{id:string;version:number}>();
  if(!result)throw new FacebookImageConflict();
  return result;
}
