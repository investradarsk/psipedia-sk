/** One conversation per Partner account. All messages live in D1, attachments in private R2. */
import { env } from "cloudflare:workers";
import { getPartnerDatabase } from "./partner-auth-store";
import { adminNotificationEventStatement } from "./admin-notifications";

type Role="PARTNER"|"ADMIN";
type Bindings={DB?:D1Database;BUCKET?:R2Bucket};
type Stored={id:string;key:string;name:string;mime:string;size:number};
type Row={id:string;partnerAccountId:string;senderRole:Role;senderRef:string;body:string;createdAt:string;attachmentCount:number};
export type ChatMessage=Row&{attachments:Array<{id:string;name:string;size:number}>};
const MAX_FILE=5*1024*1024;
export class PartnerChatError extends Error {
  constructor(message:string,readonly status=400){super(message);this.name="PartnerChatError";}
}
function db(input?:D1Database){return getPartnerDatabase(input??(env as unknown as Bindings).DB);}
function bucket(input?:R2Bucket){
  const value=input??(env as unknown as Bindings).BUCKET;
  if(!value)throw new PartnerChatError("Súkromné úložisko nie je dostupné.",503);
  return value;
}
function validAccount(id:string){
  if(!/^[a-zA-Z0-9-]{8,128}$/.test(id))throw new PartnerChatError("Konverzácia sa nenašla.",404);
  return id;
}
function validUUID(id:string){return /^[0-9a-f-]{36}$/i.test(id);}
function fileName(name:string){return (name.replace(/\\/g,"/").split("/").pop()||"priloha")
  .replace(/[\x00-\x1f\x7f"<>]/g,"_").slice(0,100)||"priloha";}
function fileKind(bytes:Uint8Array){
  const starts=(v:number[])=>v.every((n,i)=>bytes[i]===n);
  if(starts([255,216,255]))return {mime:"image/jpeg",ext:"jpg"};
  if(starts([137,80,78,71,13,10,26,10]))return {mime:"image/png",ext:"png"};
  if(starts([82,73,70,70])&&bytes[8]===87&&bytes[9]===69&&bytes[10]===66&&bytes[11]===80)
    return {mime:"image/webp",ext:"webp"};
  if(starts([37,80,68,70,45]))return {mime:"application/pdf",ext:"pdf"};
  throw new PartnerChatError("Príloha musí byť JPG, PNG, WebP alebo PDF.",415);
}
async function requireAccount(database:D1Database,id:string){
  const row=await database.prepare("SELECT status FROM partner_accounts WHERE id=?").bind(id)
    .first<{status:string}>();
  if(!row)throw new PartnerChatError("Partner neexistuje.",404);
  return row.status;
}
export async function listPartnerChat(input:{accountId:string;database?:D1Database;before?:string}){
  const database=db(input.database),id=validAccount(input.accountId);
  await requireAccount(database,id);
  const before=input.before;
  if(before&& !/^\d{4}-\d\d-\d\dT[0-9:.]+Z_[0-9a-f-]{36}$/i.test(before))
    throw new PartnerChatError("Neplatné stránkovanie.");
  const split=before?.lastIndexOf("_")??-1;
  const createdAt=before?.slice(0,split),beforeId=before?.slice(split+1);
  const sql="SELECT id,partner_account_id partnerAccountId,sender_role senderRole,"+
    "sender_ref senderRef,body,created_at createdAt,attachment_count attachmentCount "+
    "FROM partner_chat_messages WHERE partner_account_id=?"+
    (before?" AND (created_at<? OR (created_at=? AND id<?))":"")+
    " ORDER BY created_at DESC,id DESC LIMIT 51";
  const result=await database.prepare(sql).bind(...(before?[id,createdAt,createdAt,beforeId]:[id]))
    .all<Row>();
  const items=result.results.slice(0,50);
  const ids=items.map(item=>item.id);
  const all=ids.length?await database.prepare(
    "SELECT id,message_id messageId,original_name name,size_bytes size FROM partner_chat_attachments "+
    "WHERE message_id IN ("+ids.map(()=>"?").join(",")+") ORDER BY created_at,id")
    .bind(...ids).all<{id:string;messageId:string;name:string;size:number}>():{results:[]};
  const grouped=new Map<string,ChatMessage["attachments"]>();
  for(const file of all.results){
    const list=grouped.get(file.messageId)??[];
    list.push({id:file.id,name:file.name,size:file.size});
    grouped.set(file.messageId,list);
  }
  return {items:items.reverse().map(item=>({...item,attachments:grouped.get(item.id)??[]})),
    nextBefore:result.results.length>50&&items.length?items[0].createdAt+"_"+items[0].id:null};
}
export async function getPartnerChatUnread(input:{accountId:string;viewer:Role;database?:D1Database}){
  const database=db(input.database),id=validAccount(input.accountId);
  const role=input.viewer==="ADMIN"?"PARTNER":"ADMIN";
  const col=input.viewer==="ADMIN"?"admin_last_read_at":"partner_last_read_at";
  const result=await database.prepare("SELECT COUNT(*) count FROM partner_chat_messages m "+
    "LEFT JOIN partner_conversations c ON c.partner_account_id=m.partner_account_id "+
    "WHERE m.partner_account_id=? AND m.sender_role=? AND (c."+col+" IS NULL OR m.created_at>c."+col+")")
    .bind(id,role).first<{count:number}>();
  return result?.count??0;
}
export async function markPartnerChatRead(input:{accountId:string;viewer:Role;database?:D1Database;now?:Date}){
  const database=db(input.database),id=validAccount(input.accountId);
  if(input.viewer==="PARTNER"&&(await requireAccount(database,id))!=="ACTIVE")
    throw new PartnerChatError("Účet nie je aktívny.",403);
  const now=(input.now??new Date()).toISOString();
  const col=input.viewer==="ADMIN"?"admin_last_read_at":"partner_last_read_at";
  await database.batch([
    database.prepare("INSERT OR IGNORE INTO partner_conversations(partner_account_id,created_at,updated_at) "+
      "SELECT id,?,? FROM partner_accounts WHERE id=?").bind(now,now,id),
    database.prepare("UPDATE partner_conversations SET "+col+"=CASE WHEN "+col+
      " IS NULL OR "+col+"<? THEN ? ELSE "+col+" END WHERE partner_account_id=?")
      .bind(now,now,id),
  ]);
}
export async function sendPartnerChat(input:{accountId:string;senderRole:Role;senderRef:string;
  body:unknown;files:unknown;database?:D1Database;bucket?:R2Bucket;now?:Date}){
  const database=db(input.database),account=validAccount(input.accountId);
  if(input.senderRole==="PARTNER"&&(await requireAccount(database,account))!=="ACTIVE")
    throw new PartnerChatError("Účet nie je aktívny.",403);
  if(typeof input.body!=="string"||input.body.length>4000||
    /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(input.body))
    throw new PartnerChatError("Správa môže mať najviac 4 000 znakov.");
  if(!Array.isArray(input.files)||input.files.length>3||input.files.some(f=>!(f instanceof File)))
    throw new PartnerChatError("Môžete pridať najviac tri prílohy.");
  const files=input.files as File[],body=input.body.trim();
  if(!body&&!files.length)throw new PartnerChatError("Napíšte správu alebo vyberte prílohu.");
  if(files.reduce((sum,f)=>sum+f.size,0)>12*1024*1024||files.some(f=>f.size<1||f.size>MAX_FILE))
    throw new PartnerChatError("Prílohy môžu mať najviac 5 MB každá a 12 MB spolu.",413);
  const now=input.now??new Date(),iso=now.toISOString(),messageId=crypto.randomUUID();
  const count=await database.prepare("SELECT COUNT(*) count FROM partner_chat_messages "+
    "WHERE partner_account_id=? AND sender_role=? AND created_at>=?")
    .bind(account,input.senderRole,new Date(now.getTime()-60000).toISOString()).first<{count:number}>();
  if((count?.count??0)>=12)throw new PartnerChatError("Príliš veľa správ. Skúste to neskôr.",429);
  const store=files.length?bucket(input.bucket):null;
  const uploads:Stored[]=[];
  try{
    for(const file of files){
      const bytes=new Uint8Array(await file.arrayBuffer()),kind=fileKind(bytes);
      // Public /media proxy blocks the quarantine/ prefix. Chat files must
      // NEVER be saved under any directly serveable public media key.
      const key="quarantine/partner-chat/"+account+"/"+messageId+"/"+crypto.randomUUID()+"."+kind.ext;
      await store!.put(key,bytes,{httpMetadata:{contentType:kind.mime},
        customMetadata:{visibility:"private-partner-chat"}});
      uploads.push({id:crypto.randomUUID(),key,name:fileName(file.name),mime:kind.mime,size:bytes.length});
    }
    const statements:D1PreparedStatement[]=[
      database.prepare("INSERT OR IGNORE INTO partner_conversations(partner_account_id,created_at,updated_at) "+
        "SELECT id,?,? FROM partner_accounts WHERE id=?").bind(iso,iso,account),
      database.prepare("INSERT INTO partner_chat_messages"+
        "(id,partner_account_id,sender_role,sender_ref,body,attachment_count,created_at) "+
        "SELECT ?,?,?,?,?,?,? FROM partner_accounts WHERE id=?"+
        (input.senderRole==="PARTNER"?" AND status='ACTIVE'":""))
        .bind(messageId,account,input.senderRole,input.senderRef,body,uploads.length,iso,account),
      database.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json_extract('PARTNER_CHAT_ACCOUNT_CONFLICT',char(36)) END"),
      ...uploads.map(f=>database.prepare("INSERT INTO partner_chat_attachments"+
        "(id,message_id,private_key,original_name,content_type,size_bytes,created_at) VALUES(?,?,?,?,?,?,?)")
        .bind(f.id,messageId,f.key,f.name,f.mime,f.size,iso)),
      database.prepare("UPDATE partner_conversations SET last_message_at=?,updated_at=? WHERE partner_account_id=?")
        .bind(iso,iso,account),
    ];
    if(input.senderRole==="PARTNER")statements.push(adminNotificationEventStatement(database,{
      eventType:"partner_private_message",sourceType:"PARTNER_MESSAGE",resourceType:"partner_chat",
      resourceRef:messageId,actorType:"PARTNER",actorRef:"partner:"+account,
      targetUrl:"/admin/partners/accounts/"+encodeURIComponent(account)+"?tab=spravy",
      title:"Nová správa od partnera",body:"Partner vám poslal súkromnú správu.",
      tag:"partner-chat",dedupeKey:"partner-chat/"+messageId,
    },now));
    else statements.push(database.prepare("INSERT INTO partner_chat_email_queue "+
      "(message_id,partner_account_id,status,created_at,updated_at) "+
      "SELECT ?,?,'PENDING',?,? WHERE COALESCE((SELECT email_enabled "+
      "FROM partner_notification_preferences WHERE partner_account_id=?),1)=1")
      .bind(messageId,account,iso,iso,account));
    await database.batch(statements);
    return {id:messageId,createdAt:iso};
  }catch(error){
    if(store)await Promise.allSettled(uploads.map(f=>store.delete(f.key)));
    throw error;
  }
}
export async function getPartnerChatAttachment(input:{id:string;accountId:string;database?:D1Database;bucket?:R2Bucket}){
  if(!validUUID(input.id))throw new PartnerChatError("Príloha neexistuje.",404);
  const database=db(input.database),account=validAccount(input.accountId);
  const row=await database.prepare("SELECT a.private_key key,a.original_name name "+
    "FROM partner_chat_attachments a JOIN partner_chat_messages m ON m.id=a.message_id "+
    "WHERE a.id=? AND m.partner_account_id=? LIMIT 1")
    .bind(input.id,account).first<{key:string;name:string}>();
  if(!row)throw new PartnerChatError("Príloha neexistuje.",404);
  const object=await bucket(input.bucket).get(row.key);
  if(!object)throw new PartnerChatError("Príloha neexistuje.",404);
  return new Response(object.body,{headers:{
    "Content-Type":"application/octet-stream",
    "Content-Disposition":'attachment; filename="'+fileName(row.name).replace(/[^a-zA-Z0-9._-]/g,"_")+'"',
    "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
    "Content-Security-Policy":"sandbox",
  }});
}
export async function getPartnerNotificationPreferences(input:{accountId:string;database?:D1Database}){
  const database=db(input.database);
  const row=await database.prepare("SELECT email_enabled emailEnabled,in_app_enabled inAppEnabled "+
    "FROM partner_notification_preferences WHERE partner_account_id=?")
    .bind(validAccount(input.accountId)).first<{emailEnabled:number;inAppEnabled:number}>();
  return {emailEnabled:row?.emailEnabled!==0,inAppEnabled:row?.inAppEnabled!==0};
}
export async function setPartnerNotificationPreferences(input:{accountId:string;emailEnabled:unknown;
  inAppEnabled:unknown;database?:D1Database;now?:Date}){
  if(typeof input.emailEnabled!=="boolean"||typeof input.inAppEnabled!=="boolean")
    throw new PartnerChatError("Vyberte obe možnosti upozornení.");
  const database=db(input.database),account=validAccount(input.accountId);
  if((await requireAccount(database,account))!=="ACTIVE")throw new PartnerChatError("Účet nie je aktívny.",403);
  const iso=(input.now??new Date()).toISOString();
  await database.batch([
    database.prepare("INSERT INTO partner_notification_preferences "+
      "(partner_account_id,email_enabled,in_app_enabled,updated_at) VALUES(?,?,?,?) "+
      "ON CONFLICT(partner_account_id) DO UPDATE SET email_enabled=excluded.email_enabled,"+
      "in_app_enabled=excluded.in_app_enabled,updated_at=excluded.updated_at")
      .bind(account,input.emailEnabled?1:0,input.inAppEnabled?1:0,iso),
    ...(!input.emailEnabled?[database.prepare("UPDATE partner_chat_email_queue "+
      "SET status='EXPIRED',updated_at=? WHERE partner_account_id=? AND status IN ('PENDING','FAILED')")
      .bind(iso,account)]:[]),
  ]);
  return {emailEnabled:input.emailEnabled,inAppEnabled:input.inAppEnabled};
}
