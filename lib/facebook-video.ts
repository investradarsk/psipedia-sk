/** Facebook Page video support piggybacks on the existing canonical R2 media key.
 * A dedicated D1 migration is not needed: image_key/image_url already reference media.
 * Never mistake a Notion image for a video based on its title or URL parameters.
 */
export const MAX_FACEBOOK_VIDEO_BYTES=50*1024*1024;
export function isFacebookVideoKey(key:string):boolean{
  return /^facebook-images\/\d{4}\/[a-f0-9-]+\.(?:mp4|mov)$/.test(key);
}
export function isFacebookPhotoKey(key:string):boolean{
  return /^facebook-images\/\d{4}\/[a-f0-9-]+\.(?:jpg|png|webp)$/.test(key);
}
export function isFacebookMediaKey(key:string):boolean{
  return isFacebookPhotoKey(key)||isFacebookVideoKey(key);
}
export function facebookVideoMime(key:string):string|null{
  if(!isFacebookVideoKey(key))return null;
  return key.endsWith(".mov")?"video/quicktime":"video/mp4";
}
