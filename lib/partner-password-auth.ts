import { env } from "cloudflare:workers";
import { encryptPii, hashPii, normalizeEmail } from "@/lib/pii-crypto";
import {
  PARTNER_ACCOUNT_RESOURCE_TYPE,
  createPartnerSession,
  getPartnerAccountByEmailHash,
  getPartnerAccountById,
  getPartnerDatabase,
  issuePartnerAuthToken,
  partnerSessionTokenFromCookieHeader,
  revokeAllPartnerSessions,
  revokeOtherPartnerSessions,
} from "@/lib/partner-auth-store";
import {
  createPendingPartnerAccountWithPassword,
  getPartnerPasswordCredential,
  getPartnerPasswordLoginRecord,
  setPartnerPasswordCredential,
} from "@/lib/partner-auth-methods";
import {
  PARTNER_DUMMY_PASSWORD_HASH,
  PartnerPasswordError,
  hashPartnerPassword,
  validatePartnerPasswordConfirmation,
  verifyPartnerPassword,
} from "@/lib/partner-password";
import {
  processPartnerNotificationOutboxItem,
  queuePartnerMagicLinkEmail,
  queuePartnerPasswordResetEmail,
  type PartnerEmailBindings,
} from "@/lib/partner-email";
import {
  PartnerSecurityError,
  enforcePartnerAuthRateLimits,
  verifyPartnerTurnstile,
} from "@/lib/partner-security";
import { appendPartnerAuditEvent } from "@/lib/partner-platform";
import { normalizePartnerReturnTo } from "@/lib/partner-return-to";
import { isPartnerOnboardingComplete } from "@/lib/partner-contact-profile";
import { consumeResourceAccessToken, issueResourceAccessToken } from "@/lib/resource-access-store";

export const PARTNER_PASSWORD_RESET_PURPOSE = "PARTNER_PASSWORD_RESET";
export const PARTNER_PASSWORD_RESET_TTL_SECONDS = 30 * 60;
export const PARTNER_PASSWORD_GENERIC_ERROR = "E-mail alebo heslo nie sú správne.";
export const PARTNER_PASSWORD_REGISTER_RESPONSE =
  "Ak je možné pokračovať, poslali sme vám overovací odkaz e-mailom.";
export const PARTNER_PASSWORD_RESET_RESPONSE =
  "Ak k tejto adrese existuje Partner účet, poslali sme vám ďalšie pokyny.";

const RESPONSE_FLOOR_MS = 750;

type Bindings = PartnerEmailBindings & {
  DB?: D1Database;
  TURNSTILE_SECRET_KEY?: string;
  PII_HASH_KEY?: string;
  PII_ENCRYPTION_KEY?: string;
};

function runtimeBindings(bindings?: Bindings) {
  return bindings ?? env as unknown as Bindings;
}

function requireBinding(value:string|undefined,label:string){
  const clean=value?.trim();
  if(!clean) throw new PartnerPasswordAuthError(label+" nie je nakonfigurovaný.",503);
  return clean;
}

function normalizeEmailInput(value:unknown){
  if(typeof value!=="string") throw new PartnerPasswordAuthError("Zadajte platný e-mail.");
  const email=normalizeEmail(value);
  if(email.length<3||email.length>320||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
    throw new PartnerPasswordAuthError("Zadajte platný e-mail.");
  }
  return email;
}

function normalizeTurnstileToken(value:unknown){
  if(typeof value!=="string"||!value.trim()||value.length>4096){
    throw new PartnerPasswordAuthError("Dokončite bezpečnostné overenie.");
  }
  return value.trim();
}

function normalizeResetToken(value:unknown){
  if(typeof value!=="string") throw new PartnerPasswordAuthError("Odkaz na obnovenie hesla nie je platný.");
  const clean=value.trim();
  if(clean.length<32||clean.length>512||!/^[A-Za-z0-9_-]+$/.test(clean)){
    throw new PartnerPasswordAuthError("Odkaz na obnovenie hesla nie je platný.");
  }
  return clean;
}

async function floor(started:number){
  const remaining=RESPONSE_FLOOR_MS-(Date.now()-started);
  if(remaining>0) await new Promise(resolve=>setTimeout(resolve,remaining));
}

function retryableEmail(error:string){
  return error==="resend_request_failed"||error==="resend_http_429"||/^resend_http_5\d\d$/.test(error);
}

async function deliverOutbox(id:string,input:{database:D1Database;bindings:Bindings;now:Date}){
  try{
    let delivery=await processPartnerNotificationOutboxItem(id,input);
    if(delivery.status==="failed"&&retryableEmail(delivery.error)){
      delivery=await processPartnerNotificationOutboxItem(id,{...input,now:new Date(input.now.getTime()+250)});
    }
    if(delivery.status==="failed"){
      console.error(JSON.stringify({event:"partner_password_email",outboxId:id,result:"failed",error:delivery.error}));
    }
  }catch{
    console.error(JSON.stringify({event:"partner_password_email",outboxId:id,result:"failed",error:"outbox_processing_failed"}));
  }
}

async function sendVerificationMagicLink(accountId:string,returnTo:string|null,input:{database:D1Database;bindings:Bindings;now:Date}){
  const authToken=await issuePartnerAuthToken(accountId,input.database);
  const outboxId=await queuePartnerMagicLinkEmail({
    accountId,rawToken:authToken.token,returnTo,expiresAt:authToken.expiresAt,
    database:input.database,bindings:input.bindings,now:input.now,
  });
  await deliverOutbox(outboxId,input);
}

export class PartnerPasswordAuthError extends Error{
  readonly status:number;
  constructor(message:string,status=400){super(message);this.status=status;}
}

export function isPartnerPasswordAuthPublicError(error:unknown):
  error is PartnerPasswordAuthError|PartnerPasswordError|PartnerSecurityError {
  return error instanceof PartnerPasswordAuthError
    || error instanceof PartnerPasswordError
    || error instanceof PartnerSecurityError;
}

export async function registerPartnerWithPassword(input:{
  request:Request;email:unknown;password:unknown;passwordConfirmation:unknown;turnstileToken:unknown;
  returnTo?:unknown;database?:D1Database;bindings?:Bindings;now?:Date;
}){
  const bindings=runtimeBindings(input.bindings);
  const database=getPartnerDatabase(input.database??bindings.DB);
  const encryptionKey=requireBinding(bindings.PII_ENCRYPTION_KEY,"PII_ENCRYPTION_KEY");
  const hashKey=requireBinding(bindings.PII_HASH_KEY,"PII_HASH_KEY");
  const secret=requireBinding(bindings.TURNSTILE_SECRET_KEY,"TURNSTILE_SECRET_KEY");
  const email=normalizeEmailInput(input.email);
  const turnstileToken=normalizeTurnstileToken(input.turnstileToken);
  const returnTo=normalizePartnerReturnTo(input.returnTo);
  const now=input.now??new Date();

  await verifyPartnerTurnstile({
    database,request:input.request,token:turnstileToken,secret,
    action:"partner_password_register",now,
  });
  await enforcePartnerAuthRateLimits({database,request:input.request,normalizedEmail:email,hashKey,now});

  const started=Date.now();
  const password=validatePartnerPasswordConfirmation(input.password,input.passwordConfirmation);
  const [passwordHash,emailHash,emailCiphertext]=await Promise.all([
    hashPartnerPassword(password),
    hashPii(email,hashKey),
    encryptPii(email,encryptionKey),
  ]);

  const accountId=crypto.randomUUID();
  let created=false;
  try{
    await createPendingPartnerAccountWithPassword({
      id:accountId,emailCiphertext,emailHash,passwordHash,now,database,
    });
    created=true;
  }catch(error){
    const existing=await getPartnerAccountByEmailHash(emailHash,database);
    if(!existing) throw error;
    if((existing.status==="ACTIVE"||existing.status==="PENDING_VERIFICATION")){
      await sendVerificationMagicLink(existing.id,returnTo,{database,bindings,now});
    }
  }

  if(created){
    await appendPartnerAuditEvent({
      actorType:"SYSTEM",actorRef:"partner-password-auth",action:"ACCOUNT_CREATED",
      targetType:"PARTNER_ACCOUNT",targetId:accountId,database,now,
    });
    await appendPartnerAuditEvent({
      actorType:"SYSTEM",actorRef:"partner-password-auth",action:"PASSWORD_SET",
      targetType:"PARTNER_ACCOUNT",targetId:accountId,database,now,
    });
    await sendVerificationMagicLink(accountId,returnTo,{database,bindings,now});
  }

  await floor(started);
  return {message:PARTNER_PASSWORD_REGISTER_RESPONSE};
}

export async function loginPartnerWithPassword(input:{
  request:Request;email:unknown;password:unknown;turnstileToken:unknown;
  database?:D1Database;bindings?:Bindings;now?:Date;
}){
  const bindings=runtimeBindings(input.bindings);
  const database=getPartnerDatabase(input.database??bindings.DB);
  const hashKey=requireBinding(bindings.PII_HASH_KEY,"PII_HASH_KEY");
  const secret=requireBinding(bindings.TURNSTILE_SECRET_KEY,"TURNSTILE_SECRET_KEY");
  const email=normalizeEmailInput(input.email);
  const turnstileToken=normalizeTurnstileToken(input.turnstileToken);
  const now=input.now??new Date();

  await verifyPartnerTurnstile({
    database,request:input.request,token:turnstileToken,secret,
    action:"partner_password_login",now,
  });
  await enforcePartnerAuthRateLimits({database,request:input.request,normalizedEmail:email,hashKey,now});

  const started=Date.now();
  const emailHash=await hashPii(email,hashKey);
  const record=await getPartnerPasswordLoginRecord(emailHash,database);
  const passwordHash=record?.passwordHash??PARTNER_DUMMY_PASSWORD_HASH;
  const passwordValid=await verifyPartnerPassword(input.password,passwordHash);
  const usable=Boolean(
    record?.passwordHash
    && passwordValid
    && record.status==="ACTIVE"
    && record.emailVerifiedAt,
  );
  if(!usable||!record){
    await floor(started);
    throw new PartnerPasswordAuthError(PARTNER_PASSWORD_GENERIC_ERROR,401);
  }

  const session=await createPartnerSession(record.id,database);
  await floor(started);
  return {
    accountId:record.id,
    cookie:session.cookie,
    expiresAt:session.expiresAt,
    onboardingComplete:await isPartnerOnboardingComplete(record.id,database),
  };
}

export async function requestPartnerPasswordReset(input:{
  request:Request;email:unknown;turnstileToken:unknown;database?:D1Database;bindings?:Bindings;now?:Date;
}){
  const bindings=runtimeBindings(input.bindings);
  const database=getPartnerDatabase(input.database??bindings.DB);
  const hashKey=requireBinding(bindings.PII_HASH_KEY,"PII_HASH_KEY");
  const secret=requireBinding(bindings.TURNSTILE_SECRET_KEY,"TURNSTILE_SECRET_KEY");
  const email=normalizeEmailInput(input.email);
  const turnstileToken=normalizeTurnstileToken(input.turnstileToken);
  const now=input.now??new Date();

  await verifyPartnerTurnstile({
    database,request:input.request,token:turnstileToken,secret,
    action:"partner_password_reset_request",now,
  });
  await enforcePartnerAuthRateLimits({database,request:input.request,normalizedEmail:email,hashKey,now});
  const started=Date.now();
  const emailHash=await hashPii(email,hashKey);
  const account=await getPartnerAccountByEmailHash(emailHash,database);

  if(account&&account.status==="ACTIVE"&&account.emailVerifiedAt){
    const credential=await getPartnerPasswordCredential(account.id,database);
    if(credential){
      const token=await issueResourceAccessToken(database,{
        resourceType:PARTNER_ACCOUNT_RESOURCE_TYPE,
        subjectId:account.id,
        purpose:PARTNER_PASSWORD_RESET_PURPOSE,
        ttlSeconds:PARTNER_PASSWORD_RESET_TTL_SECONDS,
      });
      const outboxId=await queuePartnerPasswordResetEmail({
        accountId:account.id,rawToken:token.token,expiresAt:token.expiresAt,database,bindings,now,
      });
      await deliverOutbox(outboxId,{database,bindings,now});
    }
  }

  await floor(started);
  return {message:PARTNER_PASSWORD_RESET_RESPONSE};
}

export async function resetPartnerPassword(input:{
  token:unknown;password:unknown;passwordConfirmation:unknown;database?:D1Database;now?:Date;
}){
  const database=getPartnerDatabase(input.database);
  const now=input.now??new Date();
  const token=normalizeResetToken(input.token);
  const password=validatePartnerPasswordConfirmation(input.password,input.passwordConfirmation);
  const passwordHash=await hashPartnerPassword(password);
  const consumed=await consumeResourceAccessToken(database,{
    token,purpose:PARTNER_PASSWORD_RESET_PURPOSE,now,
  });
  if(!consumed||consumed.resourceType!==PARTNER_ACCOUNT_RESOURCE_TYPE){
    throw new PartnerPasswordAuthError("Odkaz na obnovenie hesla je neplatný alebo už expiroval.");
  }
  const account=await getPartnerAccountById(consumed.subjectId,database);
  if(!account||account.status!=="ACTIVE"||!account.emailVerifiedAt){
    throw new PartnerPasswordAuthError("Odkaz na obnovenie hesla je neplatný alebo už expiroval.");
  }
  const changed=await setPartnerPasswordCredential({
    accountId:account.id,passwordHash,mode:"RESET",now,database,
  });
  if(!changed) throw new PartnerPasswordAuthError("Odkaz na obnovenie hesla je neplatný alebo už expiroval.");
  await revokeAllPartnerSessions(account.id,now,database);
  await appendPartnerAuditEvent({
    actorType:"PARTNER",actorRef:`partner:${account.id}`,action:"PASSWORD_RESET_COMPLETED",
    targetType:"PARTNER_ACCOUNT",targetId:account.id,database,now,
  });
  await appendPartnerAuditEvent({
    actorType:"PARTNER",actorRef:`partner:${account.id}`,action:"SESSIONS_REVOKED",
    targetType:"PARTNER_ACCOUNT",targetId:account.id,metadata:{reason:"password_reset"},database,now,
  });
  return {success:true};
}

export async function updatePartnerPassword(input:{
  accountId:string;currentSessionToken:string;currentPassword?:unknown;
  newPassword:unknown;newPasswordConfirmation:unknown;database?:D1Database;now?:Date;
}){
  const database=getPartnerDatabase(input.database),now=input.now??new Date();
  const current=await getPartnerPasswordCredential(input.accountId,database);
  const nextPassword=validatePartnerPasswordConfirmation(input.newPassword,input.newPasswordConfirmation);
  if(current){
    const valid=await verifyPartnerPassword(input.currentPassword,current.passwordHash);
    if(!valid) throw new PartnerPasswordAuthError("Aktuálne heslo nie je správne.",401);
  }
  const passwordHash=await hashPartnerPassword(nextPassword);
  const mode=current?"CHANGE":"SET";
  const changed=await setPartnerPasswordCredential({
    accountId:input.accountId,passwordHash,mode,now,database,
  });
  if(!changed) throw new PartnerPasswordAuthError("Heslo sa nepodarilo uložiť.",409);
  await revokeOtherPartnerSessions(input.accountId,input.currentSessionToken,now,database);
  await appendPartnerAuditEvent({
    actorType:"PARTNER",actorRef:`partner:${input.accountId}`,
    action:current?"PASSWORD_CHANGED":"PASSWORD_SET",
    targetType:"PARTNER_ACCOUNT",targetId:input.accountId,database,now,
  });
  return {success:true,passwordSet:true};
}

export function requireCurrentPartnerSessionToken(cookieHeader:string|null|undefined){
  const token=partnerSessionTokenFromCookieHeader(cookieHeader);
  if(!token) throw new PartnerPasswordAuthError("Prihlásenie je potrebné.",401);
  return token;
}
