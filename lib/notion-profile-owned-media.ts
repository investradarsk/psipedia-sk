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

type BreedGalleryMedia={imageUrl:string;imageKey?:string|null;alt:string;caption:string;credit:string};
function absoluteMedia(value:unknown):unknown{return typeof value==="string"&&value.startsWith("/")?"https://psipedia.sk"+value:value;}
/** Map the exact logical Notion media value to physical stored values.
 * All gallery entries must be proven before any D1 change. */
export async function prepareBreedMediaProofs(field:"image"|"gallery",value:unknown,current:unknown,bindings:NotionSyncBindings):Promise<VerifiedProfileMedia[]>{
  if(field==="image")return [await prepareProfileMedia("breeds",absoluteMedia(value),bindings,absoluteMedia(current))];
  if(!Array.isArray(value)||value.length>30)throw Error("BREED_MEDIA_INVALID_GALLERY");
  const proofs:VerifiedProfileMedia[]=[];
  for(let i=0;i<value.length;i++){
    const item=value[i] as BreedGalleryMedia;
    const old=Array.isArray(current)?current[i] as BreedGalleryMedia|undefined:undefined;
    proofs.push(await prepareProfileMedia("breeds",absoluteMedia(item.imageUrl),bindings,absoluteMedia(old?.imageUrl)));
  }
  if(new Set(proofs.map(p=>p.key)).size!==proofs.length)throw Error("BREED_MEDIA_DUPLICATE_ASSET");
  return proofs;
}
export function physicalBreedMediaValue(field:"image"|"gallery",value:unknown,proofs:readonly VerifiedProfileMedia[]|undefined):unknown{
  if(field==="image"){
    if(proofs?.length!==1)throw Error("BREED_MEDIA_PROOF_MISSING");
    return requireProfileMediaProof("breeds",absoluteMedia(value),proofs[0]).url??"";
  }
  if(!Array.isArray(value)||proofs?.length!==value.length)throw Error("BREED_MEDIA_PROOF_MISSING");
  return value.map((item:BreedGalleryMedia,i:number)=>{
    const proof=requireProfileMediaProof("breeds",absoluteMedia(item.imageUrl),proofs[i]);
    if(!proof.url||!proof.key||(item.imageKey&&item.imageKey!==proof.key))throw Error("BREED_MEDIA_PROOF_MISSING");
    return {...item,imageUrl:proof.url,imageKey:proof.key};
  });
}
async function matchesBreedMedia(canonical:unknown,key:unknown,remote:unknown,bucket?:Pick<R2Bucket,"head">){
  if(remote==="")return canonical===""&&!key;
  let owned:VerifiedProfileMedia;
  try{owned=profileOwnedMediaReference("breeds",absoluteMedia(canonical));}catch{return false;}
  if(!owned.key||owned.key!==key||!bucket)return false;
  const target=absoluteMedia(remote),actual=absoluteMedia(canonical);
  if(isExternalProfileMedia(target))return await profileMediaSourceAlias("breeds",actual,target,bucket)===target;
  return actual===target&&Boolean(await bucket.head(owned.key));
}
export async function logicalBreedMediaValue(field:"image"|"gallery",canonical:unknown,currentKey:unknown,remote:unknown,bucket?:Pick<R2Bucket,"head">):Promise<unknown>{
  if(field==="image")return await matchesBreedMedia(canonical,currentKey,remote,bucket)?remote:canonical;
  if(!Array.isArray(canonical)||!Array.isArray(remote)||canonical.length!==remote.length)return canonical;
  for(let i=0;i<remote.length;i++){
    const a=canonical[i] as BreedGalleryMedia,b=remote[i] as BreedGalleryMedia;
    if(!a||!b||a.alt!==b.alt||a.caption!==b.caption||a.credit!==b.credit||
      (b.imageKey!=null&&a.imageKey!==b.imageKey)||
      !await matchesBreedMedia(a.imageUrl,a.imageKey,b.imageUrl,bucket))return canonical;
  }
  return remote;
}
