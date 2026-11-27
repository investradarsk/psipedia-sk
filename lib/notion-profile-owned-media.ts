/** Exact existing public media or explicit clear; no external fetch or deletion. */
export type ProfileMediaAgenda="events"|"organizations"|"adoptions"|"lost-found"|"help-cases"|"directory"|"eshops"|"breeds";
const folders:Record<ProfileMediaAgenda,readonly string[]>={
  events:["events"],organizations:["help"],adoptions:["help","adoptions"],
  "lost-found":["lost-found"],"help-cases":["help"],directory:["directory"],eshops:["eshops"],breeds:["breeds"],
};
export type VerifiedProfileMedia={url:string|null;key:string|null};
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
  const desired=profileOwnedMediaReference(agenda,value);
  if(!proof||proof.url!==desired.url||proof.key!==desired.key)throw Error("PROFILE_MEDIA_PROOF_MISSING");
  return desired;
}
