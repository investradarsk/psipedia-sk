"use client";

import { useEffect, useState } from "react";
import { AdminActionButton, AdminModalDialog } from "@/components/admin-interaction-system";
import type { RecordKind } from "@/lib/admin-record-lifecycle";

type Preview={
  id:number; name:string; category:string; status:string; published:boolean;
  notionLinked:boolean; notionPages:number; removalState:string|null; removalError:string|null;
  publicationSync?:string|null;publicationError?:string|null;
};
type RemovalResult={state:string;notionTrash:string;errorCode?:string;media?:{removed:number;preserved:number}};
const publicStates=new Set(["published","scheduled","PUBLISHED","ACTIVE","RESERVED","RESOLVED","EXPIRED","ARCHIVED"]);
function errorText(value:string) {
  const messages:Record<string,string>={
    NOTION_UNAVAILABLE:"Notion sa nepodarilo kontaktovať. Profil je skrytý a odstránenie čaká na opakovanie.",
    NOTION_IDENTITY_OR_SOURCE_MISMATCH:"Identita Notion stránky alebo jej databáza nesúhlasí s profilom. Nesmie sa vymazať iná stránka.",
    NOTION_TRASH_NOT_CONFIRMED:"Notion nepotvrdil presunutie stránky do koša. Odstránenie zostáva nedokončené.",
    NOTION_PUBLICATION_NOT_CONFIRMED:"Notion nepotvrdil zmenu publikovania.",
    D1_DELETE_PENDING:"Notion je v koši, ale dokončenie odstránenia v Psipedii čaká na opakovanie.",
    LOCAL_ONLY_CONFIRMATION_REQUIRED:"Záznam nie je overene prepojený s Notionom. Potvrď odstránenie iba z Psipedie.",
    LIFECYCLE_MIGRATION_0164_REQUIRED:"Pred použitím je potrebné spustiť D1 migráciu 0164.",
  };
  return messages[value]??"Operácia sa nepodarila. Skontroluj stav a prípadne ju zopakuj ("+value+").";
}
/** The only confirmation UI for canonical unpublish + permanent removal. */
export function AdminRecordLifecycleActions({
  kind,recordId,status,disabled=false,onUnpublished,returnHref,
}:{
  kind:RecordKind;recordId:number;status:string;disabled?:boolean;
  onUnpublished?:(status:string,updatedAt?:string)=>void;returnHref:string;
}) {
  const [preview,setPreview]=useState<Preview|null>(null);
  const [mode,setMode]=useState<"unpublish"|"delete"|null>(null);
  const [confirmation,setConfirmation]=useState("");
  const [localOnly,setLocalOnly]=useState(false);
  const [pending,setPending]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [unpublished,setUnpublished]=useState(false);
  const endpoint="/api/admin/record-lifecycle/"+encodeURIComponent(kind)+"/"+recordId;
  const visible=publicStates.has(status)&&!unpublished;
  useEffect(()=>{
    let live=true;
    fetch(endpoint,{cache:"no-store"}).then(async response=>{
      const value=await response.json() as Preview & {error?:string};
      if(!live)return;
      if(!response.ok) {
        if(value.error==="LIFECYCLE_MIGRATION_0164_REQUIRED")setError(errorText(value.error));
        return;
      }
      setPreview(value);
      if(value.removalState&&value.removalState!=="COMPLETE"){
        setMessage("Odstránenie zostáva nedokončené. Záznam je bezpečne skrytý.");
        setError(errorText(value.removalError??"NOTION_UNAVAILABLE"));
        setUnpublished(true);
      }else if(value.publicationSync==="PENDING"){
        setMessage("Záznam je v Admine stiahnutý, Notion stále čaká na potvrdenie.");
        setError(errorText(value.publicationError??"NOTION_UNAVAILABLE"));
      }
    }).catch(()=>{});
    return ()=>{live=false;};
  },[endpoint]);

  async function open(next:"unpublish"|"delete") {
    if(pending)return;
    setError("");setMessage("");setConfirmation("");setLocalOnly(false);
    setPending(true);
    try{
      const response=await fetch(endpoint,{cache:"no-store"});
      const data=await response.json() as Preview & {error?:string};
      if(!response.ok)throw Error(data.error??"PREFLIGHT_FAILED");
      setPreview(data);setMode(next);
    }catch(e){setError(errorText(e instanceof Error?e.message:"PREFLIGHT_FAILED"));}
    finally{setPending(false);}
  }
  async function confirm() {
    if(!mode||pending||!preview)return;
    const currentMode=mode;
    setPending(true);setError("");
    try{
      const response=await fetch(endpoint,{
        method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify(currentMode==="delete"
          ?{action:"delete",confirmation,localOnly:!preview.notionLinked&&localOnly}
          :{action:"unpublish"}),
      });
      const data=await response.json() as RemovalResult & {error?:string;notionSync?:string;errorCode?:string;updatedAt?:string};
      if(!response.ok && response.status!==202)throw Error(data.error??"LIFECYCLE_REQUEST_FAILED");
      setMode(null);
      if(currentMode==="unpublish"){
        setUnpublished(true);
        setPreview(current=>current?{...current,publicationSync:data.notionSync??"PENDING",publicationError:data.errorCode??null}:current);
        onUnpublished?.(status==="PUBLISHED"?"DRAFT":status==="ACTIVE"||status==="RESERVED"?"DRAFT":status==="scheduled"?"draft":status==="RESOLVED"||status==="EXPIRED"||status==="ARCHIVED"?"DRAFT":"draft",data.updatedAt);
        setMessage(data.notionSync==="PENDING"
          ?"Záznam je stiahnutý z webu. Prenos publikačného stavu do Notionu čaká na opravu."
          :"Záznam je stiahnutý z webu. Údaje a obrázky zostali zachované.");
        if(data.errorCode)setError(errorText(data.errorCode));
      }else if(data.state==="COMPLETE"){
        window.location.assign(returnHref);
      }else{
        setMessage("Záznam je skrytý. Odstránenie ešte nie je dokončené. Môžeš ho bezpečne zopakovať.");
        setError(errorText(data.errorCode??"NOTION_UNAVAILABLE"));
        setUnpublished(true);
        setPreview(current=>current?{...current,removalState:data.state,removalError:data.errorCode??null}:current);
        onUnpublished?.("draft");
      }
    }catch(e){setError(errorText(e instanceof Error?e.message:"LIFECYCLE_REQUEST_FAILED"));}
    finally{setPending(false);}
  }
  return <div className="admin-record-lifecycle-actions" style={{display:"grid",gap:8,justifyItems:"start"}}>
    <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
      {visible&&<AdminActionButton type="button" variant="secondary" disabled={disabled||pending}
        onClick={()=>void open("unpublish")}>Stiahnuť z webu</AdminActionButton>}
      {preview?.publicationSync==="PENDING"&&<AdminActionButton type="button" variant="secondary" disabled={disabled||pending}
        onClick={()=>void open("unpublish")}>Zopakovať prenos do Notionu</AdminActionButton>}
      <AdminActionButton type="button" variant="destructive" disabled={disabled||pending}
        onClick={()=>void open("delete")}>{preview?.removalState&&preview.removalState!=="COMPLETE"?"Zopakovať odstránenie":"Natrvalo odstrániť"}</AdminActionButton>
    </div>
    {message&&<p role="status" className="admin-message">{message}</p>}
    {error&&<p role="alert" className="admin-message admin-message--error">{error}</p>}
    <AdminModalDialog
      open={mode!==null} title={mode==="delete"?"Natrvalo odstrániť záznam?":"Stiahnuť z webu?"}
      description={mode==="delete"?"Operácia je nevratná v Admine.":"Zmení sa iba publikačný stav, nie údaje formulára."}
      onClose={()=>{if(!pending)setMode(null);}}
      footer={<>
        <AdminActionButton type="button" variant="neutral" disabled={pending}
          onClick={()=>setMode(null)}>Zrušiť</AdminActionButton>
        <AdminActionButton type="button" variant={mode==="delete"?"destructive":"primary"}
          disabled={pending||(mode==="delete"&&(confirmation!=="VYMAZAŤ"||(!preview?.notionLinked&&!localOnly)))}
          onClick={()=>void confirm()}>
          {pending?"Spracúvam…":mode==="delete"?"Potvrdiť trvalé odstránenie":"Potvrdiť stiahnutie"}
        </AdminActionButton>
      </>}
    >
      {preview&&<div style={{display:"grid",gap:10}}>
        <p><strong>{preview.name}</strong></p>
        <p>Kategória: <strong>{preview.category}</strong> · Psipedia ID: <strong>{preview.id}</strong></p>
        {mode==="unpublish"
          ? <p>Záznam zostane v Admine ako koncept a bude možné ho znova publikovať.
              Neuložené úpravy formulára táto akcia neodosiela.</p>
          : <>
              <p>Záznam bude odstránený z Adminu, verejného webu a príslušných D1 údajov.
                Túto operáciu nemožno bežne vrátiť späť v Admine.</p>
              {preview.notionLinked
                ?<p>Prepojená Notion stránka ({preview.notionPages}) bude po overení identity presunutá do <strong>koša Notion</strong>, nie definitívne vymazaná.</p>
                :<label style={{display:"flex",alignItems:"flex-start",gap:8}}>
                  <input type="checkbox" checked={localOnly} onChange={e=>setLocalOnly(e.target.checked)}/>
                  <span>Nie je overené Notion prepojenie. Potvrdzujem odstránenie <strong>iba z Psipedie</strong>. Notion stránka sa nebude vyhľadávať podľa mena ani mazať.</span>
                </label>}
              <label style={{display:"grid",gap:6}}>
                Na druhé potvrdenie napíš presne <strong>VYMAZAŤ</strong>:
                <input type="text" autoComplete="off" value={confirmation}
                  onChange={e=>setConfirmation(e.target.value)} aria-label="Druhé potvrdenie odstránenia" />
              </label>
              {preview.removalState&&preview.removalState!=="COMPLETE"&&
                <p role="status">Predchádzajúci pokus: {preview.removalState}. Opakovanie používa tú istú evidenciu a overuje Notion.</p>}
            </>}
      </div>}
    </AdminModalDialog>
  </div>;
}
