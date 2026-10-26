import {env} from "cloudflare:workers";
import {requireAdminMutation} from "@/lib/admin-auth";
import {saveAdminServiceChoice,resetAdminServiceChoice,ServiceCatalogConflictError,ServiceCatalogInputError,ServiceCatalogSchemaError,requireServiceCatalogAuditSchema} from "@/lib/service-catalog-admin-store";
import {projectServiceChoiceToDirectoryNotion} from "@/lib/service-profile-notion-bridge";
import {runNotionDirectorySyncSweep, type NotionDirectorySyncBindings} from "@/lib/notion-directory-sync";
export const dynamic="force-dynamic";
type Bindings=NotionDirectorySyncBindings & {DB?:D1Database;SERVICE_CATALOG_ADMIN_WRITES_ENABLED?:string;SERVICE_CATALOG_NOTION_MIRROR_READY?:string;NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED?:string};
type Props={params:Promise<{id:string}>};
export async function PATCH(request:Request,{params}:Props){
  const auth=await requireAdminMutation(request);
  if(auth.response)return auth.response;
  const cfg=env as unknown as Bindings;
  if(cfg.SERVICE_CATALOG_ADMIN_WRITES_ENABLED!=="true")
    return Response.json({error:"Canonical selections are not activated."},{status:503});
  if(!cfg.DB)return Response.json({error:"D1 is unavailable."},{status:503});
  const rawId=(await params).id;
  const profileId=Number(rawId);
  if(!/^[1-9]\d*$/.test(rawId)||!Number.isSafeInteger(profileId))
    return Response.json({error:"Invalid profile ID."},{status:400});
  try{
    await requireServiceCatalogAuditSchema(cfg.DB);
    const raw=await request.json();
    if(!raw||typeof raw!=="object"||Array.isArray(raw)
       ||Object.keys(raw).some(k=>!["optionId","choice","expectedVersion"].includes(k)))
      return Response.json({error:"Unsupported selection payload."},{status:400});
    const input=raw as {optionId:string;choice:"yes"|"no"|"unknown";expectedVersion:number};
    const selection=input.choice==="unknown"
      ?await resetAdminServiceChoice(cfg.DB,{profileId,optionId:input.optionId,expectedVersion:input.expectedVersion},auth.user!.email)
      :await saveAdminServiceChoice(cfg.DB,{profileId,optionId:input.optionId,choice:input.choice,expectedVersion:input.expectedVersion},auth.user!.email);
    // Reuse the already connected bidirectional Directory "Služby" property.
    // Canonical choice save is complete; make partial projection failure explicit.
    let notionProjection:"updated"|"unchanged"|"deferred"="unchanged";
    try{
      notionProjection=await projectServiceChoiceToDirectoryNotion(cfg.DB,profileId,input.optionId,input.choice);
    }catch{
      notionProjection="deferred";
    }
    // The canonical choice is already saved. Reconcile ONLY this linked
    // Directory profile and its Services V3 Notion relation immediately.
    // A remote failure must not roll back the user's saved D1 selection.
    let notionFieldSync:"disabled"|"unlinked"|"synced"|"unchanged"|"pending"="disabled";
    if(cfg.NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED==="true"){
      try{
        const result=await runNotionDirectorySyncSweep({
          database:cfg.DB,bindings:cfg,targetProfileId:profileId,syncServiceRelations:true,
        });
        notionFieldSync=(!result.enabled||!result.schemaReady||result.failed)?"pending"
          :result.pulledFromNotion||result.pushedToNotion?"synced"
          :result.unchanged?"unchanged":"unlinked";
      }catch{
        notionFieldSync="pending";
      }
    }
    if(notionProjection==="deferred"&&notionFieldSync!=="disabled")notionFieldSync="pending";
    const needsReview=notionProjection==="deferred"||notionFieldSync==="pending";
    return Response.json({selection,notionProjection,notionFieldSync,
      ...(needsReview?{warning:"Výber je uložený v Psipedii, ale prenos do Notionu vyžaduje kontrolu."}:{})});
  }catch(error){
    return Response.json({error:error instanceof Error?error.message:"Selection failed."},
      {status:error instanceof ServiceCatalogInputError||error instanceof SyntaxError?400:error instanceof ServiceCatalogConflictError?409:error instanceof ServiceCatalogSchemaError?503:500});
  }
}
