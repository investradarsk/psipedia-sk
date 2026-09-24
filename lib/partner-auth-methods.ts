import { getPartnerDatabase, type PartnerAccountRecord } from "@/lib/partner-auth-store";

export type PartnerPasswordCredential = {
  accountId: string;
  passwordHash: string;
  hashVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type PartnerGoogleIdentity = {
  id: string;
  accountId: string;
  providerSubject: string;
  linkedAt: string;
};

export async function getPartnerPasswordCredential(accountId: string, database?: D1Database) {
  const db = getPartnerDatabase(database);
  return db.prepare(
    "SELECT account_id accountId,password_hash passwordHash,hash_version hashVersion,created_at createdAt,updated_at updatedAt " +
    "FROM partner_password_credentials WHERE account_id=?1 LIMIT 1",
  ).bind(accountId).first<PartnerPasswordCredential>();
}

export async function getPartnerPasswordLoginRecord(emailHash: string, database?: D1Database) {
  const db = getPartnerDatabase(database);
  return db.prepare(
    "SELECT a.id,a.status,a.email_verified_at emailVerifiedAt,p.password_hash passwordHash " +
    "FROM partner_accounts a LEFT JOIN partner_password_credentials p ON p.account_id=a.id " +
    "WHERE a.email_hash=?1 LIMIT 1",
  ).bind(emailHash).first<{id:string;status:string;emailVerifiedAt:string|null;passwordHash:string|null}>();
}

export async function createPendingPartnerAccountWithPassword(input: {
  id: string;
  emailCiphertext: string;
  emailHash: string;
  passwordHash: string;
  now: Date;
  database?: D1Database;
}) {
  const db = getPartnerDatabase(input.database);
  const nowIso = input.now.toISOString();
  await db.batch([
    db.prepare(
      "INSERT INTO partner_accounts (id,email_ciphertext,email_hash,status,created_at,updated_at) " +
      "VALUES (?1,?2,?3,'PENDING_VERIFICATION',?4,?4)",
    ).bind(input.id,input.emailCiphertext,input.emailHash,nowIso),
    db.prepare(
      "INSERT INTO partner_password_credentials (account_id,password_hash,hash_version,created_at,updated_at) " +
      "VALUES (?1,?2,1,?3,?3)",
    ).bind(input.id,input.passwordHash,nowIso),
  ]);
}

export async function setPartnerPasswordCredential(input:{
  accountId:string;
  passwordHash:string;
  mode:"SET"|"CHANGE"|"RESET";
  now:Date;
  database?:D1Database;
}) {
  const db=getPartnerDatabase(input.database), now=input.now.toISOString();
  if(input.mode==="SET"){
    const result=await db.prepare(
      "INSERT OR IGNORE INTO partner_password_credentials(account_id,password_hash,hash_version,created_at,updated_at) VALUES(?1,?2,1,?3,?3)",
    ).bind(input.accountId,input.passwordHash,now).run();
    return (result.meta?.changes??0)===1;
  }
  const result=await db.prepare(
    "UPDATE partner_password_credentials SET password_hash=?2,hash_version=1,updated_at=?3 WHERE account_id=?1",
  ).bind(input.accountId,input.passwordHash,now).run();
  return (result.meta?.changes??0)===1;
}

export async function getPartnerGoogleIdentityBySubject(providerSubject:string,database?:D1Database){
  return getPartnerDatabase(database).prepare(
    "SELECT id,account_id accountId,provider_subject providerSubject,linked_at linkedAt FROM partner_auth_identities " +
    "WHERE provider='GOOGLE' AND provider_subject=?1 LIMIT 1",
  ).bind(providerSubject).first<PartnerGoogleIdentity>();
}

export async function getPartnerGoogleIdentityForAccount(accountId:string,database?:D1Database){
  return getPartnerDatabase(database).prepare(
    "SELECT id,account_id accountId,provider_subject providerSubject,linked_at linkedAt FROM partner_auth_identities " +
    "WHERE provider='GOOGLE' AND account_id=?1 LIMIT 1",
  ).bind(accountId).first<PartnerGoogleIdentity>();
}

export async function linkGoogleIdentity(input:{accountId:string;providerSubject:string;now:Date;database?:D1Database}){
  const db=getPartnerDatabase(input.database), now=input.now.toISOString();
  const id=crypto.randomUUID();
  await db.prepare(
    "INSERT INTO partner_auth_identities(id,account_id,provider,provider_subject,linked_at,created_at,updated_at) " +
    "VALUES(?1,?2,'GOOGLE',?3,?4,?4,?4)",
  ).bind(id,input.accountId,input.providerSubject,now).run();
  return id;
}

export async function createActiveGooglePartnerAccount(input:{
  id:string;emailCiphertext:string;emailHash:string;providerSubject:string;now:Date;database?:D1Database;
}) {
  const db=getPartnerDatabase(input.database), now=input.now.toISOString(), identityId=crypto.randomUUID();
  await db.batch([
    db.prepare(
      "INSERT INTO partner_accounts(id,email_ciphertext,email_hash,status,email_verified_at,created_at,updated_at) " +
      "VALUES(?1,?2,?3,'ACTIVE',?4,?4,?4)",
    ).bind(input.id,input.emailCiphertext,input.emailHash,now),
    db.prepare(
      "INSERT INTO partner_auth_identities(id,account_id,provider,provider_subject,linked_at,created_at,updated_at) " +
      "VALUES(?1,?2,'GOOGLE',?3,?4,?4,?4)",
    ).bind(identityId,input.id,input.providerSubject,now),
  ]);
  return {accountId:input.id,identityId};
}

export async function getPartnerAuthMethodSummary(accountId:string,database?:D1Database){
  const db=getPartnerDatabase(database);
  try{
    const [password,google]=await Promise.all([
      getPartnerPasswordCredential(accountId,db),
      getPartnerGoogleIdentityForAccount(accountId,db),
    ]);
    return {passwordSet:Boolean(password),googleLinked:Boolean(google),googleLinkedAt:google?.linkedAt??null};
  }catch(error){
    if(error instanceof Error && /no such table:\s*partner_(?:password_credentials|auth_identities)/i.test(error.message)){
      return {passwordSet:false,googleLinked:false,googleLinkedAt:null};
    }
    throw error;
  }
}
