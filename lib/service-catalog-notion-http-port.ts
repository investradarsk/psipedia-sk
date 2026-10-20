/**
 * Server-only Notion Pages adapter for the canonical Services V3 catalog.
 * Not a profile writer. Requires independently approved catalog-only data-source
 * and property schema. No direct route or scheduled invocation.
 */
type Key="optionId"|"optionVersion"|"kind"|"label"|"group"|"meaning"|"primaryCategory"|"categories"|"valueKind";
type Fields={kind:"service"|"attribute";label:string;group:string;meaning:string;
  primaryCategory:string;categories:string[];valueKind:"tri_state"};
type Local=Fields&{id:string;version:number};
type Properties=Record<Key,string>;
type NotionPage={id?:string;parent?:{type?:string;data_source_id?:string};
  properties?:Record<string,unknown>;last_edited_time?:string;archived?:boolean;in_trash?:boolean};
const names:Key[]=["optionId","optionVersion","kind","label","group","meaning","primaryCategory","categories","valueKind"];
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const URL_ROOT="https://api.notion.com/v1/pages/";
const notionVersion="2025-09-03";
const textProp=(value:string)=>({rich_text:[{text:{content:value}}]});
const selectProp=(value:string)=>({select:{name:value}});
function textValue(v:unknown):string{
  const p=v as {rich_text?:Array<{plain_text?:string}>}|undefined;
  if(!p||!Array.isArray(p.rich_text))throw new Error("NOTION_SCHEMA_MISMATCH");
  return p.rich_text.map(x=>x.plain_text??"").join("");
}
function titleValue(v:unknown):string{
  const p=v as {title?:Array<{plain_text?:string}>}|undefined;
  if(!p||!Array.isArray(p.title))throw new Error("NOTION_SCHEMA_MISMATCH");
  return p.title.map(x=>x.plain_text??"").join("");
}
function selectValue(v:unknown):string{
  const p=v as {select?:{name?:string}|null}|undefined;
  if(!p||typeof p.select?.name!=="string")throw new Error("NOTION_SCHEMA_MISMATCH");
  return p.select.name;
}
function versionValue(v:unknown):number{
  const p=v as {number?:number}|undefined;
  if(!p||!Number.isSafeInteger(p.number)||p.number! < 0)throw new Error("NOTION_SCHEMA_MISMATCH");
  return p.number!;
}
function multiValue(v:unknown):string[]{
  const p=v as {multi_select?:Array<{name?:string}>}|undefined;
  if(!p||!Array.isArray(p.multi_select)||!p.multi_select.every(x=>typeof x.name==="string"))
    throw new Error("NOTION_SCHEMA_MISMATCH");
  return p.multi_select.map(x=>x.name!);
}
export function createServiceCatalogNotionHttpPort(config:{
  token:string;dataSourceId:string;properties:Properties;
  // An explicit internal rollout gate; no writer otherwise.
  allowWrites?:boolean;fetcher?:typeof fetch;
}){
  const m=config.properties;
  if(!UUID.test(config.dataSourceId)||typeof config.token!=="string"||!config.token||
     !m||names.some(k=>typeof m[k]!=="string"||!m[k].trim())||
     new Set(names.map(k=>m[k])).size!==names.length||
     names.some(k=>m[k].toLocaleLowerCase("sk")==="služby"))
    throw new Error("CATALOG_SCHEMA_NOT_APPROVED");
  const client=config.fetcher??fetch;
  async function request(method:"GET"|"PATCH",pageId:string,body?:unknown):Promise<NotionPage>{
    if(!UUID.test(pageId))throw new Error("INVALID_NOTION_PAGE_ID");
    if(method==="PATCH"&&config.allowWrites!==true)throw new Error("NOTION_WRITES_DISABLED");
    const response=await client(URL_ROOT+encodeURIComponent(pageId),{
      method,headers:{"Authorization":"Bearer "+config.token,"Notion-Version":notionVersion,
        "Content-Type":"application/json"},
      ...(body?{body:JSON.stringify(body)}:{})
    });
    if(!response.ok)throw new Error("NOTION_HTTP_"+response.status);
    const page=await response.json() as NotionPage;
    if(!page||typeof page!=="object"||!UUID.test(page.id??""))
      throw new Error("INVALID_NOTION_RESPONSE");
    return page;
  }
  return {
    async readPage(pageId:string){
      const page=await request("GET",pageId);
      if(page.parent?.type!=="data_source_id"||
         page.parent.data_source_id?.replaceAll("-","").toLowerCase()!==config.dataSourceId.replaceAll("-","").toLowerCase())
        throw new Error("WRONG_CATALOG_DATA_SOURCE");
      const p=page.properties??{};
      return {
        pageId:page.id!,dataSourceId:page.parent.data_source_id!,
        sourceOptionId:textValue(p[m.optionId]),sourceOptionVersion:versionValue(p[m.optionVersion]),
        notionLastEditedAt:page.last_edited_time??"",
        archived:page.archived===true,inTrash:page.in_trash===true,
        fields:{kind:selectValue(p[m.kind]) as Fields["kind"],label:titleValue(p[m.label]),
          group:textValue(p[m.group]),meaning:textValue(p[m.meaning]),
          primaryCategory:selectValue(p[m.primaryCategory]),
          categories:multiValue(p[m.categories]),valueKind:selectValue(p[m.valueKind]) as "tri_state"}
      };
    },
    async writePage(pageId:string,local:Local){
      if(config.allowWrites!==true)throw new Error("NOTION_WRITES_DISABLED");
      const props:Record<string,unknown>={
        [m.optionId]:textProp(local.id),[m.optionVersion]:{number:local.version},
        [m.kind]:selectProp(local.kind),[m.label]:{title:[{text:{content:local.label}}]},
        [m.group]:textProp(local.group),[m.meaning]:textProp(local.meaning),
        [m.primaryCategory]:selectProp(local.primaryCategory),
        [m.categories]:{multi_select:local.categories.map(name=>({name}))},
        [m.valueKind]:selectProp(local.valueKind)
      };
      const ack=await request("PATCH",pageId,{properties:props});
      if(ack.id?.replaceAll("-","").toLowerCase()!==pageId.replaceAll("-","").toLowerCase())
        throw new Error("NOTION_ACK_PAGE_MISMATCH");
      return {pageId:ack.id!,notionLastEditedAt:ack.last_edited_time??""};
    }
  };
}
