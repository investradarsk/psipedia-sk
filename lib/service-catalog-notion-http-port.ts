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

/**
 * Confirmed Services V3 Notion catalog; intentionally not Adresar profiles.
 * The writer stays disconnected and disabled unless separately activated.
 */
export const PSIPEDIA_SERVICE_CATALOG_NOTION_BINDING = Object.freeze({
  dataSourceId: "8785fd64-36c3-4acf-aade-ad99c30ad45d",
  properties: Object.freeze({
    optionId: "Option ID", optionVersion: "Verzia", kind: "Typ", label: "Názov",
    group: "Skupina", meaning: "Význam", primaryCategory: "Hlavná kategória",
    categories: "Kategórie", valueKind: "Druh hodnoty",
  }),
});
export function createPsipediaServiceCatalogNotionHttpPort(config: {
  token: string; allowWrites?: boolean; fetcher?: typeof fetch;
}) {
  return createServiceCatalogNotionHttpPort({
    ...config,
    dataSourceId: PSIPEDIA_SERVICE_CATALOG_NOTION_BINDING.dataSourceId,
    properties: {...PSIPEDIA_SERVICE_CATALOG_NOTION_BINDING.properties},
  });
}


/**
 * Read-only complete-snapshot Notion registry for dynamic Services V3 options.
 * All rows are fetched from the specifically approved, dedicated catalog source.
 * No profile directory reads/writes, page creation or production activation.
 */
export function createPsipediaServiceCatalogReadOnlyRegistry(config: {
  token: string;
  fetcher?: typeof fetch;
}) {
  if (typeof config.token !== "string" || !config.token) {
    throw new Error("NOTION_REGISTRY_TOKEN_MISSING");
  }
  const dataSourceId = PSIPEDIA_SERVICE_CATALOG_NOTION_BINDING.dataSourceId;
  const properties = PSIPEDIA_SERVICE_CATALOG_NOTION_BINDING.properties;
  const catalogUrl = "https://api.notion.com/v1/data_sources/" + dataSourceId + "/query";
  const client = config.fetcher ?? fetch;
  const normalizeId = (id: string) => id.replaceAll("-", "").toLowerCase();
  const dynamicId = /^(svc|attr)\.admin\.[a-f0-9]{32}$/;
  const categorySlugs = new Set([
    "veterinari", "treneri", "kynologicke-kluby", "chovatelske-kluby",
    "chovatelske-stanice", "salony-a-sluzby", "hotely-a-opatrovanie",
    "vencenie", "fyzioterapia", "dalsie-sluzby"
  ]);
  type Target = {optionId: string;pageId: string;dataSourceId: string};
  async function allPages(): Promise<Target[]> {
    const targets: Target[] = [];
    const seenOptions = new Set<string>();
    const seenPages = new Set<string>();
    const seenCursors = new Set<string>();
    let cursor: string | null = null;
    // Never treat an incomplete Notion pagination result as a complete ownership registry.
    for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
      const response = await client(catalogUrl, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + config.token,
          "Notion-Version": notionVersion,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(cursor ? {page_size: 100,start_cursor: cursor} : {page_size: 100})
      });
      if (!response.ok) throw new Error("NOTION_REGISTRY_HTTP_" + response.status);
      const data = await response.json() as {
        results?: unknown[]; has_more?: boolean;next_cursor?: string | null;
      };
      if (!data || !Array.isArray(data.results) || typeof data.has_more !== "boolean" ||
          data.results.length > 100 || (data.has_more && (!data.next_cursor || typeof data.next_cursor !== "string")) ||
          (!data.has_more && data.next_cursor !== null && data.next_cursor !== undefined)) {
        throw new Error("NOTION_REGISTRY_INCOMPLETE_PAGE");
      }
      for (const raw of data.results) {
        const entry = raw as NotionPage;
        if (!entry || !UUID.test(entry.id ?? "") || entry.archived === true ||
            entry.in_trash === true || entry.parent?.type !== "data_source_id" ||
            !UUID.test(entry.parent.data_source_id ?? "") ||
            normalizeId(entry.parent.data_source_id!) !== normalizeId(dataSourceId)) {
          throw new Error("NOTION_REGISTRY_WRONG_PAGE");
        }
        const props = entry.properties ?? {};
        let optionId: string;
        try {
          optionId = textValue(props[properties.optionId]);
          const version = versionValue(props[properties.optionVersion]);
          const kind = selectValue(props[properties.kind]);
          const label = titleValue(props[properties.label]);
          const group = textValue(props[properties.group]);
          const meaning = textValue(props[properties.meaning]);
          const primary = selectValue(props[properties.primaryCategory]);
          const categories = multiValue(props[properties.categories]);
          const valueKind = selectValue(props[properties.valueKind]);
          if (!dynamicId.test(optionId) || version < 1 ||
              (kind !== "service" && kind !== "attribute") ||
              (kind === "service" && !optionId.startsWith("svc.")) ||
              (kind === "attribute" && !optionId.startsWith("attr.")) ||
              !label.trim() || !group.trim() || !meaning.trim() ||
              !categorySlugs.has(primary) || categories.length === 0 ||
              !categories.includes(primary) ||
              categories.some(x => !categorySlugs.has(x)) ||
              new Set(categories).size !== categories.length || valueKind !== "tri_state") {
            throw new Error("NOTION_REGISTRY_INVALID_OPTION");
          }
        } catch {
          throw new Error("NOTION_REGISTRY_INVALID_OPTION");
        }
        const optionKey = optionId.toLowerCase();
        const pageKey = normalizeId(entry.id!);
        if (seenOptions.has(optionKey) || seenPages.has(pageKey)) {
          throw new Error("NOTION_REGISTRY_DUPLICATE_OWNER");
        }
        seenOptions.add(optionKey);
        seenPages.add(pageKey);
        targets.push({optionId,pageId:entry.id!,dataSourceId});
      }
      if (!data.has_more) return targets;
      if (seenCursors.has(data.next_cursor!)) throw new Error("NOTION_REGISTRY_CURSOR_LOOP");
      seenCursors.add(data.next_cursor!);
      cursor = data.next_cursor!;
    }
    throw new Error("NOTION_REGISTRY_PAGINATION_LIMIT");
  }
  return {
    async get(optionId: string): Promise<Target | null> {
      if (!dynamicId.test(optionId)) return null;
      const all = await allPages();
      return all.find(x => x.optionId === optionId) ?? null;
    },
    list: allPages
  };
}
