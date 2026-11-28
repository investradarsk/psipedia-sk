import { breedWorkcopyPhysicalProperty } from "./breed-notion-workcopy-field-contract.mjs";
import { BREED_CONTROLLED_FIELDS, readBreedControlledNotionCell } from "./breed-workcopy-controlled.mjs";
import { verifiedBreedStructuredProperty, validateBreedStructuredValue, breedStructuredAuthorityFields } from "./notion-breed-structured-authority.mjs";
import { breedWorkcopyEventValues } from "./notion-breed-workcopy-field-values.mjs";

const ratings=new Set(["energy","trainability","children","otherDogs","apartment","grooming","shedding","preyDrive"]);
const deferred=new Set(["accent","editorialComplete","editorial.heroTraits",
  "relatedBreedIds","relatedArticleIds","directoryProfileIds"]);
const normalizeSlug=name=>name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,90).replace(/-+$/g,"");
function property(page,name,type){
  const p=page?.properties?.[name];
  if(!p||p.type!==type||!Object.hasOwn(p,type)||p.has_more===true)
    throw Error("BREED_INBOUND_PROPERTY_MISSING: "+name);
  return p[type];
}
function text(page,name,type="rich_text"){
  const cells=property(page,name,type);
  if(!Array.isArray(cells)||cells.length>=25||cells.some(cell=>!cell||cell.type!=="text"||
    typeof cell.plain_text!=="string"))throw Error("BREED_INBOUND_TEXT_INCOMPLETE: "+name);
  return cells.map(cell=>cell.plain_text).join("").trim();
}
export function readInboundBreedIdentity(page){
  const id=text(page,"Psipedia ID");
  const source=property(page,"Zdrojový profil Notion","url");
  if(source!==null&&typeof source!=="string")throw Error("BREED_INBOUND_ORIGINAL_INVALID");
  const reviewed=property(page,"Odkontrolované","checkbox");
  if(typeof reviewed!=="boolean")throw Error("BREED_INBOUND_REVIEW_INVALID");
  return {id,source,reviewed};
}

/** Only a genuinely new page, not a historic work-copy missing its numeric ID.
 * Missing or malformed properties never masquerade as empty. Existing
 * NOT NULL draft numeric columns use 0 for unknown, never guessed 1 or 3.
 * Structured lists and media are decoded here; the importer prepares all media before the canonical transaction. */
export function readInboundBreedDraft(page,schema){
  const identity=readInboundBreedIdentity(page);
  if(identity.id||identity.source||identity.reviewed)throw Error("BREED_INBOUND_IDENTITY_REVIEW");
  const name=text(page,"Názov plemena","title");
  if(!name)return null;
  if(name.length>120)throw Error("BREED_INBOUND_NAME_TOO_LONG");
  const explicit=text(page,"URL profil / slug");
  const slug=explicit||normalizeSlug(name);
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>90)throw Error("BREED_INBOUND_SLUG_INVALID");
  const fci=property(page,"FCI číslo","number");
  if(fci!==null&&(!Number.isSafeInteger(fci)||fci<1))throw Error("BREED_INBOUND_FCI_INVALID");
  const controlled={};
  for(const field of BREED_CONTROLLED_FIELDS){
    const raw=property(page,field.notion,field.type);
    if(field.type==="select"&&raw!==null&&(!raw||typeof raw.name!=="string"))
      throw Error("BREED_INBOUND_SELECT_INVALID");
    if(field.type==="multi_select"&&(!Array.isArray(raw)||raw.length>=25||
      raw.some(item=>!item||typeof item.name!=="string")))throw Error("BREED_INBOUND_MULTI_INVALID");
    controlled[field.key]=readBreedControlledNotionCell(field,page.properties[field.notion]);
  }
  const payload={name,slug,status:"draft",fciNumber:fci,fciGroup:controlled.fciGroupSelect===null?0:Number(controlled.fciGroupSelect),
    fciSectionNumber:controlled.fciSectionSelect??"",size:controlled.sizeSelect??"",
    editorialComplete:false,importKey:null,fciStandard:{},editorial:{},seo:{}};
  const selected=[];
  for(const entry of schema){
    if(entry.mode!=="content"||entry.id==="name"||deferred.has(entry.id))continue;
    const physical=breedWorkcopyPhysicalProperty(entry.notion);
    if(!physical)continue;
    const raw=page.properties?.[physical];
    if(entry.type==="number"){
      const score=property(page,physical,"number");
      if(ratings.has(entry.id)&&score!==null&&(!Number.isInteger(score)||score<1||score>5))
        throw Error("BREED_INBOUND_RATING_INVALID: "+physical);
    }else if(entry.type==="text"||entry.type==="url"){
      if(raw?.type==="url"){
        const url=property(page,physical,"url");
        if(url!==null&&typeof url!=="string")throw Error("BREED_INBOUND_URL_INVALID");
      }else text(page,physical);
    }else continue;
    selected.push(physical);
  }
  const parsed=breedWorkcopyEventValues(page,selected,schema,true);
  if(parsed.failures.length)throw Error("BREED_INBOUND_FIELD_INVALID: "+parsed.failures[0].field);
  for(const {field,value} of parsed.values){
    if(field==="fciNumber")continue;
    if(breedStructuredAuthorityFields.includes(field)){
      const entry=schema.find(item=>item.id===field&&item.mode==="content");
      const physical=breedWorkcopyPhysicalProperty(entry?.notion);
      if(!physical||!validateBreedStructuredValue(field,value)||!verifiedBreedStructuredProperty(field,page.properties?.[physical],{present:true,value},schema))throw Error("BREED_INBOUND_STRUCTURED_INVALID: "+field);
      payload[field]=value;continue;
    }
    if(ratings.has(field)){payload[field]=value??0;continue;}
    if(typeof value!=="string")throw Error("BREED_INBOUND_FIELD_INVALID: "+field);
    if(field.includes(".")){
      const [root,key]=field.split(".");
      if(!["fciStandard","editorial","seo"].includes(root))throw Error("BREED_INBOUND_FIELD_INVALID");
      payload[root][key]=value;
    }else payload[field]=value;
  }
  for(const rating of ratings)if(!Object.hasOwn(payload,rating))payload[rating]=0;
  // The existing Admin editor explicitly mirrors the children value to
  // legacy family; there is no independent family property in the work source.
  payload.family=payload.children;
  return {payload,controlled};
}
