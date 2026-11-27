import type { NotionSyncBindings } from "./notion-sync-shared.ts";
/** Exact existing public media or explicit clear, or an existing importer-verified source alias. */
export type ProfileMediaAgenda="events"|"organizations"|"adoptions"|"lost-found"|"help-cases"|"directory"|"eshops"|"breeds";
const folders:Record<ProfileMediaAgenda,readonly string[]>={
  events:["events"],organizations:["help"],adoptions:["help","adoptions"],
  "lost-found":["lost-found"],"help-cases":["help"],directory:["directory"],eshops:["eshops"],breeds:["breeds"],
};
export type VerifiedProfileMedia={url:string|null;key:string|null;sourceUrl?:string};
export function profileOwnedMediaReference(agenda:ProfileMediaAgenda,value:unknown):VerifiedProfileMedia {
  if(value==="")return {url:null,key:null};
  if(typeof value!=="string"||!value.startsWith("https://psipedia.sk/media/"))
    throw Error("PROFILE_MEDIA_EXTERNAL_OR_INVALID_REVIEW");
  const url=value.slice("https://psipedia.sk".length),key=url.slice("/media/".length);
  if(!/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.(?:jpg|jpeg|png|webp|avif)$/i.test(key)||!folders[agenda].includes(key.split("/")[0]))
    throw Error("PROFILE_MEDIA_SCOPE_REVIEW");
  return {url,key};
}
export async function verifyProfileOwnedMedia(agenda:ProfileMediaAgenda,value:unknown,bucket?:Pick<R2Bucket,"head">):Promise<VerifiedProfileMedia>{
  const media=profileOwnedMediaReference(agenda,value);
  if(media.key&&(!bucket||!await bucket.head(media.key)))throw Error("PROFILE_MEDIA_R2_MISSING");
  return media;
}
export function requireProfileMediaProof(agenda:ProfileMediaAgenda,value:unknown,proof?:VerifiedProfileMedia){
  if(proof?.sourceUrl!==undefined){
    if(!isExternalProfileMedia(value)||proof.sourceUrl!==value||!proof.url)throw Error("PROFILE_MEDIA_SOURCE_PROOF_MISSING");
    const owned=profileOwnedMediaReference(agenda,"https://psipedia.sk"+proof.url);
    if(owned.key!==proof.key)throw Error("PROFILE_MEDIA_SOURCE_PROOF_MISSING");
    return proof;
  }
  const desired=profileOwnedMediaReference(agenda,value);
  if(!proof||proof.url!==desired.url||proof.key!==desired.key)throw Error("PROFILE_MEDIA_PROOF_MISSING");
  return desired;
}

/** The source is never treated as an R2 path or fetched if it is our own host. */
export function isExternalProfileMedia(value:unknown):value is string{
  if(typeof value!=="string"||!value||value.trim()!==value)return false;
  try{
    const url=new URL(value),host=url.hostname.toLowerCase().replace(/\.$/,"");
    return url.protocol==="https:"&&!url.username&&!url.password&&(!url.port||url.port==="443")&&
      host!=="psipedia.sk"&&!host.endsWith(".psipedia.sk")&&!!host;
  }catch{return false;}
}
async function sourceHash(value:string){
  const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}
/** Reconstruct logical equality ONLY from the current canonical asset and its
 * durable source hash. No baseline alone can prove that an upload succeeded. */
export async function profileMediaSourceAlias(agenda:ProfileMediaAgenda,canonical:unknown,source:unknown,bucket?:Pick<R2Bucket,"head">):Promise<unknown>{
  if(!isExternalProfileMedia(source)||typeof canonical!=="string"||!bucket)return canonical;
  let media:VerifiedProfileMedia;
  try{media=profileOwnedMediaReference(agenda,canonical);}catch{return canonical;}
  if(!media.key)return canonical;
  const object=await bucket.head(media.key),hash=await sourceHash(source);
  const metadata=object?.customMetadata;
  return metadata?.notionSourceHash===hash||metadata?.sourceUrlHash===hash?source:canonical;
}
export async function prepareProfileMedia(agenda:ProfileMediaAgenda,value:unknown,bindings:NotionSyncBindings,canonical:unknown):Promise<VerifiedProfileMedia>{
  if(!isExternalProfileMedia(value))return verifyProfileOwnedMedia(agenda,value,bindings.BUCKET);
  // Reuse the existing bounded/validated remote importer; don't create a new
  // media pipeline or download a signed/private Psipedia object.
  const {prepareNotionMainImage,safeRemoteImageUrl}=await import("./notion-sync-shared.ts");
  safeRemoteImageUrl(value);
  let current:VerifiedProfileMedia|undefined;
  try{current=profileOwnedMediaReference(agenda,canonical);}catch{/* not an owned asset */}
  const folder=agenda==="organizations"||agenda==="help-cases"?"help":agenda;
  const prepared=await prepareNotionMainImage({bindings,sourceUrl:value,folder,existingImageUrl:current?.url,existingImageKey:current?.key});
  if(!prepared.imageUrl||!prepared.imageKey)throw Error("PROFILE_MEDIA_SOURCE_PREPARATION_FAILED");
  const verified=await verifyProfileOwnedMedia(agenda,"https://psipedia.sk"+prepared.imageUrl,bindings.BUCKET);
  if(verified.key!==prepared.imageKey||await profileMediaSourceAlias(agenda,"https://psipedia.sk"+prepared.imageUrl,value,bindings.BUCKET)!==value)
    throw Error("PROFILE_MEDIA_SOURCE_ALIAS_UNVERIFIED");
  return {...verified,sourceUrl:value};
}
export function profileMediaCanonicalValue(proof:VerifiedProfileMedia):string{
  return proof.url?"https://psipedia.sk"+proof.url:"";
}
