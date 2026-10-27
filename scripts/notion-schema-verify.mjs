import { pathToFileURL } from "node:url";
import { NOTION_SCHEMA_CONTRACTS } from "./notion-schema-contract.mjs";
const API="https://api.notion.com/v1/data_sources/";
/** Read-only schema validation; never creates, changes or deletes Notion data. */
export async function verifyNotionSchemas({token,fallbackToken,fetcher=fetch,
 contracts=NOTION_SCHEMA_CONTRACTS,onFallback=()=>{}}={}){
 // A 404 from the Notion data-source endpoint also means the integration has no
 // access. If a second configured integration can read it, validate the schema
 // against that response. Never treat a 404 as a passed contract.
 const tokens=[...new Set([token,fallbackToken].filter(value=>typeof value==="string"&&value.trim()))];
 if(!tokens.length)throw Error("NOTION_SCHEMA_TOKEN_MISSING");
 const issues=[];let checked=0;
 for(const item of contracts){
  let response=null,failed=false;
  for(let index=0;index<tokens.length;index++){
   try{
    response=await fetcher(API+encodeURIComponent(item.id),{
     method:"GET",headers:{Authorization:"Bearer "+tokens[index],"Notion-Version":"2025-09-03"},
     signal:AbortSignal.timeout(20000)});
   }catch{
    issues.push(item.name+": REQUEST_FAILED");failed=true;break;
   }
   if(response.ok){
    if(index>0)onFallback(item.name);
    break;
   }
   // Permission failures can be specific to one integration; all other HTTP
   // failures must remain visible and must not be masked by another token.
   if(index===tokens.length-1||![403,404].includes(response.status)){
    issues.push(item.name+": NOTION_HTTP_"+response.status);failed=true;break;
   }
  }
  if(failed||!response?.ok)continue;
  let data;
  try{data=await response.json();}
  catch{issues.push(item.name+": INVALID_RESPONSE");continue;}
  if(!data||data.id?.replaceAll("-","").toLowerCase()!==item.id.replaceAll("-","").toLowerCase()
   ||!data.properties||typeof data.properties!=="object"){
   issues.push(item.name+": WRONG_DATA_SOURCE_OR_SCHEMA");continue;
  }
  checked++;
  for(const [name,expected] of Object.entries(item.properties)){
   const prop=data.properties[name];
   if(!prop){issues.push(item.name+": MISSING_PROPERTY "+name);continue;}
   if(prop.type!==expected){issues.push(item.name+": WRONG_TYPE "+name+
     " expected="+expected+" actual="+prop.type);continue;}
   const actual=prop.select?.options??prop.status?.options??[];
   for(const value of item.options?.[name]??[])
    if(!actual.some(x=>x.name===value))issues.push(item.name+": MISSING_OPTION "+name+"/"+value);
  }
 }
 return {checked,expected:contracts.length,issues};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const r=await verifyNotionSchemas({
   token:process.env.NOTION_SCHEMA_TOKEN,
   fallbackToken:process.env.NOTION_SCHEMA_FALLBACK_TOKEN,
   onFallback:name=>console.warn("Notion schema: "+name+" checked using a second authorized integration"),
  });
  r.issues.forEach(x=>console.error("Notion contract: "+x));
  if(r.issues.some(x=>/NOTION_HTTP_40[34]/.test(x)))
   console.error("Notion access denied/not found: check database Connections for the GitHub Actions Notion integration(s). A Notion 404 can mean the integration lacks access; never remove that source from the guard.");
  if(r.issues.length||r.checked!==r.expected){
   console.error("Notion schema drift: "+r.issues.length+" issue(s), "+r.checked+"/"+r.expected+" checked");
   process.exitCode=1;
  }else console.log("Notion schema contract PASS: "+r.checked+" data sources");
 }catch(error){console.error("Notion schema contract FAILED: "+error?.message);process.exitCode=1;}
}
