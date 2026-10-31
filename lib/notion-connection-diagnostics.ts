import { NOTION_AUTHORITY_GROUPS } from "@/lib/notion-field-authority";
import { readNotionSyncOverview } from "@/lib/notion-sync-overview";
import { readNotionTransferAudit } from "@/lib/notion-transfer-audit";
import { notionRequest } from "@/lib/notion-sync-shared";
import { PSIPEDIA_SERVICE_CATALOG_NOTION_BINDING } from "@/lib/service-catalog-notion-http-port";

type Config=Record<string,unknown> & {NOTION_API_TOKEN?:string};
type ScopeConfig={sourceKey?:string;enabledKey:string};
const mappings:Record<string,ScopeConfig>={
  breeds:{sourceKey:"NOTION_BREEDS_DATA_SOURCE_ID",enabledKey:"NOTION_BREED_SYNC_ENABLED"},
  articles:{sourceKey:"NOTION_ARTICLES_DATA_SOURCE_ID",enabledKey:"NOTION_ARTICLE_SYNC_ENABLED"},
  eshops:{sourceKey:"NOTION_ESHOPS_DATA_SOURCE_ID",enabledKey:"NOTION_ESHOP_SYNC_ENABLED"},
  events:{enabledKey:"NOTION_EVENTS_HELP_BIDIRECTIONAL_SYNC_ENABLED"},
  organizations:{enabledKey:"NOTION_EVENTS_HELP_BIDIRECTIONAL_SYNC_ENABLED"},
  adoptions:{enabledKey:"NOTION_EVENTS_HELP_BIDIRECTIONAL_SYNC_ENABLED"},
  "help-cases":{enabledKey:"NOTION_EVENTS_HELP_BIDIRECTIONAL_SYNC_ENABLED"},
  "lost-found":{enabledKey:"NOTION_EVENTS_HELP_BIDIRECTIONAL_SYNC_ENABLED"},
  "service-catalog":{enabledKey:"SERVICE_CATALOG_NOTION_AUTO_ENABLED"},
  "facebook-images":{sourceKey:"NOTION_FACEBOOK_IMAGES_DATA_SOURCE_ID",enabledKey:"NOTION_FACEBOOK_IMAGES_SYNC_ENABLED"},
};
const uid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const active=(x:unknown)=>x==="true"||x==="1";
export async function readNotionConnectionDiagnostic(
  db:D1Database, env:Config, scope:string, runLiveTest:boolean,
){
  const group=NOTION_AUTHORITY_GROUPS.find(g=>g.scope===scope);
  if(!group)throw Error("UNKNOWN_SCOPE");
  const config=scope.startsWith("directory:")?
    {sourceKey:"NOTION_DIRECTORY_DATA_SOURCE_ID",enabledKey:"NOTION_DIRECTORY_SYNC_ENABLED"}:
    mappings[scope];
  if(!config)throw Error("UNKNOWN_SCOPE");
  const enabled=active(env[config.enabledKey]);
  let sourceId=config.sourceKey ? String(env[config.sourceKey]??"") : "";
  if(scope==="service-catalog")sourceId=PSIPEDIA_SERVICE_CATALOG_NOTION_BINDING.dataSourceId;
  if(["events","organizations","adoptions","help-cases","lost-found"].includes(scope)){
    try{
      const row=await db.prepare("SELECT data_source_id AS id FROM notion_agenda_targets WHERE agenda=? LIMIT 1")
        .bind(scope).first<{id:string}>();
      sourceId=row?.id??"";
    }catch{sourceId="";}
  }
  const configured=enabled&&uid.test(sourceId)&&Boolean(env.NOTION_API_TOKEN?.trim());
  const area=scope.startsWith("directory:")?"directory":scope;
  const overview=(await readNotionSyncOverview(db)).find(row=>row.area===area);
  const audit=await readNotionTransferAudit(db,scope);
  let live:"NOT_TESTED"|"PASSED"|"FAILED"|"NOT_CONFIGURED"="NOT_TESTED";
  let missingFields:string[]=[];
  let propertyCount:number|null=null;
  if(runLiveTest){
    if(!configured)live="NOT_CONFIGURED";
    else{
      try{
        // A metadata GET ONLY. No Notion writes, scans, import, publication or D1 mutations.
        const data=await notionRequest<{id?:string;properties?:Record<string,unknown>}>(
          {NOTION_API_TOKEN:env.NOTION_API_TOKEN},
          "/data_sources/"+encodeURIComponent(sourceId),{method:"GET"},{retryTransient:false},
        );
        if(data.id?.replaceAll("-","").toLowerCase()!==sourceId.replaceAll("-","").toLowerCase())
          throw Error("NOTION_SOURCE_MISMATCH");
        const names=new Set(Object.keys(data.properties??{}));
        propertyCount=names.size;
        missingFields=group.fields
          .filter(field=>field.notionLabel && field.notionLabel!=="Obsah (bloky stránky)"
            && field.id!=="existing-rules")
          .filter(field=>!names.has(field.notionLabel!))
          .map(field=>field.notionLabel!).slice(0,60);
        live="PASSED"; // metadata is reachable; missing columns are reported separately.
      }catch{
        live="FAILED"; // no raw provider errors or tokens are exposed.
      }
    }
  }
  return {
    scope,enabled,configured,sourceConfigured:uid.test(sourceId),
    test:live,propertyCount,missingFields,
    history:audit.records,historyReady:audit.ready,
    previousMappingAt:overview?.lastMappingAt??null,
    previousMappingCount:overview?.count??null,
    previousMappingStatus:overview?.status??"UNKNOWN",
    sharedMappingScope:area!==scope,
    testedAt:runLiveTest?new Date().toISOString():null,
    notes:"Historické mapovania neobsahujú spoľahlivý smer. Smer a čas auditu sú zaznamenané len od aktivácie denníka 0148.",
  };
}
