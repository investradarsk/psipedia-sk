import { breedWorkcopyEventValues } from "./notion-breed-workcopy-field-values.mjs";
import { breedWorkcopyPhysicalProperty } from "./breed-notion-workcopy-field-contract.mjs";

export const breedStructuredAuthorityFields=Object.freeze(["sports","sources","healthRisks","goodFor","consider","gallery","image"]);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const obj=x=>!!x&&typeof x==="object"&&!Array.isArray(x);
const str=(x,n)=>typeof x==="string"&&x.length<=n;
const nonblank=(x,n)=>str(x,n)&&!!x.trim();
const url=x=>{try{const u=new URL(x);return u.protocol==="https:"&&!u.username&&!u.password}catch{return false}};
/** Existing scoped media path; external URLs must pass the shared importer. */
export function breedOwnedMediaKey(value){
  if(typeof value!=="string")return null;
  const path=value.startsWith("https://psipedia.sk/")?value.slice("https://psipedia.sk".length):value;
  if(!/^\/media\/breeds\/[A-Za-z0-9_/-]+\.(?:jpg|jpeg|png|webp|avif)$/i.test(path)||
    path.includes("//")||path.split("/").some(part=>part===".."||part==="."))return null;
  return path.slice("/media/".length);
}
function externalMedia(value){
  if(!nonblank(value,700)||value.trim()!==value)return false;
  try{
    const parsed=new URL(value),host=parsed.hostname.toLowerCase().replace(/\.$/,"");
    return parsed.protocol==="https:"&&!parsed.username&&!parsed.password&&(!parsed.port||parsed.port==="443")&&
      host!=="psipedia.sk"&&!host.endsWith(".psipedia.sk");
  }catch{return false;}
}
export function validateBreedStructuredValue(field,value){
  if(field==="image")return value===""||breedOwnedMediaKey(value)!==null||externalMedia(value);
  if(!Array.isArray(value)||value.length>30)return false;
  if(["healthRisks","goodFor","consider"].includes(field))
    return value.every(x=>nonblank(x,500))&&new Set(value).size===value.length;
  if(field==="sports")return value.every(x=>obj(x)&&Object.keys(x).every(k=>["key","label","rating","note"].includes(k))&&
    nonblank(x.key,80)&&nonblank(x.label,120)&&(x.rating===null||(Number.isInteger(x.rating)&&x.rating>=1&&x.rating<=5))&&str(x.note,500))&&
    new Set(value.map(x=>x.key)).size===value.length;
  if(field==="sources")return value.every(x=>obj(x)&&Object.keys(x).every(k=>["label","url"].includes(k))&&nonblank(x.label,300)&&
    str(x.url,700)&&(x.url===""||url(x.url)));
  if(field==="gallery")return value.every(x=>obj(x)&&Object.keys(x).every(k=>["imageUrl","imageKey","alt","caption","credit"].includes(k))&&
    (breedOwnedMediaKey(x.imageUrl)!==null&&(x.imageKey==null||x.imageKey===breedOwnedMediaKey(x.imageUrl))||externalMedia(x.imageUrl)&&x.imageKey==null)&&
    str(x.alt,240)&&str(x.caption,500)&&str(x.credit,300))&&new Set(value.map(x=>breedOwnedMediaKey(x.imageUrl)??x.imageUrl)).size===value.length;
  return false;
}
/** Reparse the exact physical cell independently of the observation transport.
 * Wrong types, missing values, mentions and partial property lists fail closed. */
export function verifiedBreedStructuredProperty(field,raw,observed,schema){
  if(!breedStructuredAuthorityFields.includes(field)||!observed?.present||!obj(raw)||raw.has_more===true||
    !Object.hasOwn(raw,raw.type))return false;
  const spec=schema.find(entry=>entry.id===field&&entry.mode==="content");
  const physical=breedWorkcopyPhysicalProperty(spec?.notion);
  if(!spec||!physical)return false;
  if(raw.type==="rich_text"){
    if(!Array.isArray(raw.rich_text)||raw.rich_text.length>=25||raw.rich_text.some(p=>!p||p.type!=="text"||typeof p.plain_text!=="string"))return false;
  }else if(raw.type==="url"&&field==="image"){
    if(raw.url!==null&&typeof raw.url!=="string")return false;
  }else return false;
  const parsed=breedWorkcopyEventValues({properties:{[physical]:raw}},[physical],[spec],true);
  return parsed.failures.length===0&&parsed.values.length===1&&equal(parsed.values[0].value,observed.value)&&validateBreedStructuredValue(field,observed.value);
}
