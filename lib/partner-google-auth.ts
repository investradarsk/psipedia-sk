import { timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "cloudflare:workers";
import { SITE_URL } from "@/config/public-site";
import { decryptPii, encryptPii, hashPii, normalizeEmail } from "@/lib/pii-crypto";
import {
  createPartnerSession,
  getPartnerAccountByEmailHash,
  getPartnerAccountById,
  getPartnerDatabase,
} from "@/lib/partner-auth-store";
import {
  createActiveGooglePartnerAccount,
  getPartnerGoogleIdentityBySubject,
  getPartnerGoogleIdentityForAccount,
  linkGoogleIdentity,
} from "@/lib/partner-auth-methods";
import { appendPartnerAuditEvent } from "@/lib/partner-platform";
import { normalizePartnerReturnTo } from "@/lib/partner-return-to";
import { isPartnerOnboardingComplete } from "@/lib/partner-contact-profile";

const GOOGLE_AUTHORIZATION_ENDPOINT="https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT="https://oauth2.googleapis.com/token";
const GOOGLE_JWKS_URI=new URL("https://www.googleapis.com/oauth2/v3/certs");
const GOOGLE_REDIRECT_URI=SITE_URL+"/api/partner/auth/google/callback";
const GOOGLE_FLOW_COOKIE="__Host-psipedia_google_oauth";
export const GOOGLE_PENDING_LINK_COOKIE="__Host-psipedia_google_link_pending";
const FLOW_TTL_SECONDS=10*60;
const encoder=new TextEncoder();
const googleJwks=createRemoteJWKSet(GOOGLE_JWKS_URI);

export type PartnerGoogleIntent="LOGIN"|"REGISTER"|"LINK";

type GoogleBindings={
  DB?:D1Database;
  PII_ENCRYPTION_KEY?:string;
  PII_HASH_KEY?:string;
  GOOGLE_OAUTH_ENABLED?:string;
  GOOGLE_OAUTH_CLIENT_ID?:string;
  GOOGLE_OAUTH_CLIENT_SECRET?:string;
};

type GoogleFlow={
  state:string;
  nonce:string;
  verifier:string;
  intent:PartnerGoogleIntent;
  accountId:string|null;
  returnTo:string|null;
  expiresAt:number;
};

type PendingLink={
  accountId:string;
  providerSubject:string;
  returnTo:string|null;
  expiresAt:number;
};

function runtimeBindings(bindings?:GoogleBindings){
  return bindings??env as unknown as GoogleBindings;
}
function enabled(value:unknown){
  return typeof value==="string"&&(value==="1"||value.toLowerCase()==="true");
}
function requireGoogleConfig(bindings?:GoogleBindings){
  const b=runtimeBindings(bindings);
  const clientId=b.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret=b.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const encryptionKey=b.PII_ENCRYPTION_KEY?.trim();
  const hashKey=b.PII_HASH_KEY?.trim();
  if(!enabled(b.GOOGLE_OAUTH_ENABLED)||!clientId||!clientSecret){
    throw new PartnerGoogleAuthError("Prihlásenie cez Google momentálne nie je dostupné.",503);
  }
  if(!encryptionKey||!hashKey){
    throw new PartnerGoogleAuthError("Prihlásenie cez Google momentálne nie je dostupné.",503);
  }
  return {bindings:b,clientId,clientSecret,encryptionKey,hashKey};
}
export function isPartnerGoogleOAuthEnabled(bindings?:GoogleBindings){
  const b=runtimeBindings(bindings);
  return enabled(b.GOOGLE_OAUTH_ENABLED)
    && Boolean(b.GOOGLE_OAUTH_CLIENT_ID?.trim())
    && Boolean(b.GOOGLE_OAUTH_CLIENT_SECRET?.trim())
    && Boolean(b.PII_ENCRYPTION_KEY?.trim())
    && Boolean(b.PII_HASH_KEY?.trim());
}
function base64Url(bytes:Uint8Array){
  let binary="";
  for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}
function randomToken(bytes=32){
  return base64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}
async function pkceChallenge(verifier:string){
  const digest=await crypto.subtle.digest("SHA-256",encoder.encode(verifier));
  return base64Url(new Uint8Array(digest));
}
function cookieValue(cookieHeader:string|null|undefined,name:string){
  if(!cookieHeader)return null;
  for(const item of cookieHeader.split(";")){
    const separator=item.indexOf("=");
    if(separator<0||item.slice(0,separator).trim()!==name)continue;
    try{return decodeURIComponent(item.slice(separator+1).trim());}catch{return null;}
  }
  return null;
}
function secureCookie(name:string,value:string,maxAge:number,sameSite:"Lax"|"Strict"){
  return name+"="+encodeURIComponent(value)+"; Path=/; Max-Age="+maxAge+"; HttpOnly; Secure; SameSite="+sameSite;
}
function clearCookie(name:string,sameSite:"Lax"|"Strict"){
  return name+"=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite="+sameSite;
}
function safeEqual(a:string,b:string){
  const left=encoder.encode(a),right=encoder.encode(b);
  return left.length===right.length&&timingSafeEqual(left,right);
}
function parseIntent(value:unknown):PartnerGoogleIntent{
  if(value==="LOGIN"||value==="REGISTER"||value==="LINK")return value;
  throw new PartnerGoogleAuthError("Neplatný spôsob prihlásenia cez Google.");
}
function activeAccount(account:{status:string;emailVerifiedAt:string|null}|null){
  return Boolean(account&&account.status==="ACTIVE"&&account.emailVerifiedAt);
}
export class PartnerGoogleAuthError extends Error{
  readonly status:number;
  constructor(message:string,status=400){super(message);this.status=status;}
}

export async function startPartnerGoogleFlow(input:{
  intent:unknown;returnTo?:unknown;accountId?:string|null;bindings?:GoogleBindings;now?:Date;
}){
  const config=requireGoogleConfig(input.bindings);
  const intent=parseIntent(input.intent);
  if(intent==="LINK"&&!input.accountId)throw new PartnerGoogleAuthError("Prihlásenie je potrebné.",401);
  const now=input.now??new Date();
  const state=randomToken(),nonce=randomToken(),verifier=randomToken(48);
  const flow:GoogleFlow={
    state,nonce,verifier,intent,accountId:intent==="LINK"?input.accountId??null:null,
    returnTo:normalizePartnerReturnTo(input.returnTo),
    expiresAt:now.getTime()+FLOW_TTL_SECONDS*1000,
  };
  const encrypted=await encryptPii(JSON.stringify(flow),config.encryptionKey);
  const url=new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
  url.searchParams.set("client_id",config.clientId);
  url.searchParams.set("redirect_uri",GOOGLE_REDIRECT_URI);
  url.searchParams.set("response_type","code");
  url.searchParams.set("scope","openid email profile");
  url.searchParams.set("state",state);
  url.searchParams.set("nonce",nonce);
  url.searchParams.set("code_challenge",await pkceChallenge(verifier));
  url.searchParams.set("code_challenge_method","S256");
  url.searchParams.set("prompt","select_account");
  return {location:url.toString(),cookie:secureCookie(GOOGLE_FLOW_COOKIE,encrypted,FLOW_TTL_SECONDS,"Lax")};
}

async function readFlow(cookieHeader:string|null|undefined,state:unknown,config:ReturnType<typeof requireGoogleConfig>,now:Date){
  if(typeof state!=="string"||state.length<32||state.length>512)throw new PartnerGoogleAuthError("Google prihlásenie nie je platné.");
  const encrypted=cookieValue(cookieHeader,GOOGLE_FLOW_COOKIE);
  if(!encrypted)throw new PartnerGoogleAuthError("Google prihlásenie nie je platné.");
  let flow:GoogleFlow;
  try{flow=JSON.parse(await decryptPii(encrypted,config.encryptionKey)) as GoogleFlow;}
  catch{throw new PartnerGoogleAuthError("Google prihlásenie nie je platné.");}
  if(!flow||flow.expiresAt<=now.getTime()||!safeEqual(flow.state,state)||!flow.nonce||!flow.verifier){
    throw new PartnerGoogleAuthError("Google prihlásenie nie je platné.");
  }
  return flow;
}

async function exchangeCode(code:unknown,flow:GoogleFlow,config:ReturnType<typeof requireGoogleConfig>,fetchImpl:typeof fetch){
  if(typeof code!=="string"||code.length<8||code.length>4096)throw new PartnerGoogleAuthError("Google prihlásenie nie je platné.");
  const response=await fetchImpl(GOOGLE_TOKEN_ENDPOINT,{
    method:"POST",
    headers:{"content-type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({
      code,client_id:config.clientId,client_secret:config.clientSecret,
      redirect_uri:GOOGLE_REDIRECT_URI,grant_type:"authorization_code",code_verifier:flow.verifier,
    }),
    signal:AbortSignal.timeout(8_000),
  });
  if(!response.ok)throw new PartnerGoogleAuthError("Google prihlásenie sa nepodarilo dokončiť.",502);
  const data=await response.json() as {id_token?:unknown};
  if(typeof data.id_token!=="string"||data.id_token.length>20_000){
    throw new PartnerGoogleAuthError("Google prihlásenie sa nepodarilo dokončiť.",502);
  }
  return data.id_token;
}

export async function verifyPartnerGoogleIdToken(input:{
  idToken:string;
  nonce:string;
  clientId:string;
}){
  const verified=await jwtVerify(input.idToken,googleJwks,{
    algorithms:["RS256"],
    issuer:["https://accounts.google.com","accounts.google.com"],
    audience:input.clientId,
    clockTolerance:5,
  });
  const payload=verified.payload;
  if(typeof payload.nonce!=="string"||!safeEqual(payload.nonce,input.nonce)){
    throw new PartnerGoogleAuthError("Google prihlásenie nie je platné.");
  }
  if(Array.isArray(payload.aud)&&payload.aud.length>1&&payload.azp!==input.clientId){
    throw new PartnerGoogleAuthError("Google prihlásenie nie je platné.");
  }
  if(typeof payload.azp==="string"&&payload.azp!==input.clientId){
    throw new PartnerGoogleAuthError("Google prihlásenie nie je platné.");
  }
  if(typeof payload.sub!=="string"||!payload.sub||payload.sub.length>255){
    throw new PartnerGoogleAuthError("Google prihlásenie nie je platné.");
  }
  if(typeof payload.email!=="string"||payload.email_verified!==true){
    throw new PartnerGoogleAuthError("Google e-mail nie je overený.");
  }
  const email=normalizeEmail(payload.email);
  if(email.length<3||email.length>320||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
    throw new PartnerGoogleAuthError("Google e-mail nie je platný.");
  }
  return {providerSubject:payload.sub,email};
}

function postAuthTarget(onboardingComplete:boolean,returnTo:string|null){
  if(!onboardingComplete){
    return returnTo?"/partner/onboarding?returnTo="+encodeURIComponent(returnTo):"/partner/onboarding";
  }
  return returnTo??"/partner";
}

export function googleReturnBridge(target:string){
  const safeTarget=normalizePartnerReturnTo(target)??"/partner";
  return "/partner/google-navrat?to="+encodeURIComponent(safeTarget);
}
async function pendingLinkCookie(input:PendingLink,key:string){
  const encrypted=await encryptPii(JSON.stringify(input),key);
  return secureCookie(GOOGLE_PENDING_LINK_COOKIE,encrypted,FLOW_TTL_SECONDS,"Strict");
}

export async function handlePartnerGoogleCallback(input:{
  request:Request;code:unknown;state:unknown;database?:D1Database;bindings?:GoogleBindings;now?:Date;fetchImpl?:typeof fetch;
}){
  const config=requireGoogleConfig(input.bindings);
  const database=getPartnerDatabase(input.database??config.bindings.DB);
  const now=input.now??new Date();
  const flow=await readFlow(input.request.headers.get("cookie"),input.state,config,now);
  const idToken=await exchangeCode(input.code,flow,config,input.fetchImpl??fetch);
  const google=await verifyPartnerGoogleIdToken({
    idToken,
    nonce:flow.nonce,
    clientId:config.clientId,
  });
  const cookies=[clearCookie(GOOGLE_FLOW_COOKIE,"Lax")];
  const linked=await getPartnerGoogleIdentityBySubject(google.providerSubject,database);

  if(flow.intent==="LOGIN"){
    if(!linked)return {location:"/partner/prihlasenie?google=unlinked",cookies};
    const account=await getPartnerAccountById(linked.accountId,database);
    if(!activeAccount(account))return {location:"/partner/prihlasenie?google=unavailable",cookies};
    const session=await createPartnerSession(linked.accountId,database);
    cookies.push(session.cookie);
    const onboardingComplete=await isPartnerOnboardingComplete(linked.accountId,database);
    return {location:googleReturnBridge(postAuthTarget(onboardingComplete,flow.returnTo)),cookies};
  }

  if(flow.intent==="LINK"){
    if(!flow.accountId)throw new PartnerGoogleAuthError("Google prepojenie nie je platné.");
    if(linked&&linked.accountId!==flow.accountId){
      return {location:"/partner/nastavenia?google=already-linked",cookies};
    }
    const pending:PendingLink={
      accountId:flow.accountId,providerSubject:google.providerSubject,
      returnTo:flow.returnTo??"/partner/nastavenia",expiresAt:now.getTime()+FLOW_TTL_SECONDS*1000,
    };
    cookies.push(await pendingLinkCookie(pending,config.encryptionKey));
    return {location:googleReturnBridge("/partner/prepojit-google"),cookies};
  }

  if(linked){
    const account=await getPartnerAccountById(linked.accountId,database);
    if(!activeAccount(account))return {location:"/partner/prihlasenie?google=unavailable",cookies};
    const session=await createPartnerSession(linked.accountId,database);
    cookies.push(session.cookie);
    const onboardingComplete=await isPartnerOnboardingComplete(linked.accountId,database);
    return {location:googleReturnBridge(postAuthTarget(onboardingComplete,flow.returnTo)),cookies};
  }

  const emailHash=await hashPii(google.email,config.hashKey);
  const existing=await getPartnerAccountByEmailHash(emailHash,database);
  if(existing){
    if(existing.status!=="ACTIVE"&&existing.status!=="PENDING_VERIFICATION"){
      return {location:"/partner/prihlasenie?google=unavailable",cookies};
    }
    const pending:PendingLink={
      accountId:existing.id,providerSubject:google.providerSubject,
      returnTo:flow.returnTo,expiresAt:now.getTime()+FLOW_TTL_SECONDS*1000,
    };
    cookies.push(await pendingLinkCookie(pending,config.encryptionKey));
    return {
      location:"/partner/prihlasenie?googleLink=required&returnTo="+encodeURIComponent("/partner/prepojit-google"),
      cookies,
    };
  }

  const accountId=crypto.randomUUID();
  const emailCiphertext=await encryptPii(google.email,config.encryptionKey);
  try{
    const created=await createActiveGooglePartnerAccount({
      id:accountId,emailCiphertext,emailHash,providerSubject:google.providerSubject,now,database,
    });
    await appendPartnerAuditEvent({
      actorType:"SYSTEM",actorRef:"partner-google-auth",action:"ACCOUNT_CREATED",
      targetType:"PARTNER_ACCOUNT",targetId:created.accountId,database,now,
    });
    await appendPartnerAuditEvent({
      actorType:"SYSTEM",actorRef:"partner-google-auth",action:"EMAIL_VERIFIED",
      targetType:"PARTNER_ACCOUNT",targetId:created.accountId,database,now,
    });
    await appendPartnerAuditEvent({
      actorType:"SYSTEM",actorRef:"partner-google-auth",action:"GOOGLE_IDENTITY_LINKED",
      targetType:"PARTNER_ACCOUNT",targetId:created.accountId,database,now,
    });
    const session=await createPartnerSession(created.accountId,database);
    cookies.push(session.cookie);
    return {location:googleReturnBridge(postAuthTarget(false,flow.returnTo)),cookies};
  }catch(error){
    const racedIdentity=await getPartnerGoogleIdentityBySubject(google.providerSubject,database);
    if(racedIdentity){
      const account=await getPartnerAccountById(racedIdentity.accountId,database);
      if(activeAccount(account)){
        const session=await createPartnerSession(racedIdentity.accountId,database);
        cookies.push(session.cookie);
        return {
          location:googleReturnBridge(postAuthTarget(await isPartnerOnboardingComplete(racedIdentity.accountId,database),flow.returnTo)),
          cookies,
        };
      }
    }
    const racedEmail=await getPartnerAccountByEmailHash(emailHash,database);
    if(racedEmail){
      if(racedEmail.status!=="ACTIVE"&&racedEmail.status!=="PENDING_VERIFICATION"){
        return {location:"/partner/prihlasenie?google=unavailable",cookies};
      }
      const pending:PendingLink={
        accountId:racedEmail.id,providerSubject:google.providerSubject,
        returnTo:flow.returnTo,expiresAt:now.getTime()+FLOW_TTL_SECONDS*1000,
      };
      cookies.push(await pendingLinkCookie(pending,config.encryptionKey));
      return {
        location:"/partner/prihlasenie?googleLink=required&returnTo="+encodeURIComponent("/partner/prepojit-google"),
        cookies,
      };
    }
    throw error;
  }
}

export async function getPendingGoogleLink(cookieHeader:string|null|undefined,bindings?:GoogleBindings,now=new Date()){
  const config=requireGoogleConfig(bindings);
  const encrypted=cookieValue(cookieHeader,GOOGLE_PENDING_LINK_COOKIE);
  if(!encrypted)return null;
  try{
    const pending=JSON.parse(await decryptPii(encrypted,config.encryptionKey)) as PendingLink;
    if(!pending?.accountId||!pending.providerSubject||pending.expiresAt<=now.getTime())return null;
    return pending;
  }catch{return null;}
}

export async function confirmPendingGoogleLink(input:{
  accountId:string;cookieHeader:string|null|undefined;database?:D1Database;bindings?:GoogleBindings;now?:Date;
}){
  const config=requireGoogleConfig(input.bindings);
  const database=getPartnerDatabase(input.database??config.bindings.DB);
  const now=input.now??new Date();
  const pending=await getPendingGoogleLink(input.cookieHeader,config.bindings,now);
  if(!pending||pending.accountId!==input.accountId){
    throw new PartnerGoogleAuthError("Google prepojenie vypršalo alebo nie je platné.",400);
  }
  const account=await getPartnerAccountById(input.accountId,database);
  if(!activeAccount(account))throw new PartnerGoogleAuthError("Partner účet nie je dostupný.",401);
  const bySubject=await getPartnerGoogleIdentityBySubject(pending.providerSubject,database);
  if(bySubject&&bySubject.accountId!==input.accountId){
    throw new PartnerGoogleAuthError("Tento Google účet je už prepojený s iným Partner účtom.",409);
  }
  const current=await getPartnerGoogleIdentityForAccount(input.accountId,database);
  if(current&&current.providerSubject!==pending.providerSubject){
    throw new PartnerGoogleAuthError("Partner účet už má prepojený iný Google účet.",409);
  }
  if(!current&&!bySubject){
    await linkGoogleIdentity({accountId:input.accountId,providerSubject:pending.providerSubject,now,database});
    await appendPartnerAuditEvent({
      actorType:"PARTNER",actorRef:"partner:"+input.accountId,action:"GOOGLE_IDENTITY_LINKED",
      targetType:"PARTNER_ACCOUNT",targetId:input.accountId,database,now,
    });
  }
  return {
    success:true,
    location:normalizePartnerReturnTo(pending.returnTo)??"/partner/nastavenia",
    clearCookie:clearCookie(GOOGLE_PENDING_LINK_COOKIE,"Strict"),
  };
}

export function clearPartnerGoogleFlowCookie(){
  return clearCookie(GOOGLE_FLOW_COOKIE,"Lax");
}
export const PARTNER_GOOGLE_REDIRECT_URI=GOOGLE_REDIRECT_URI;
