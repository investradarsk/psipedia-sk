"use client";

import { useEffect, useState } from "react";
import { AdminEditorSyncStatus, type EditorSyncState } from "@/components/admin-editor-sync-status";

type Agenda = "organizations" | "adoptions" | "help-cases" | "lost-found";
type State = "synced" | "pending" | "review" | "disabled" | "unlinked" | "setup";

const captions: Record<State,string> = {
  synced: "Synchronizácia potvrdená",
  pending: "Uložené v D1 · čaká sa na Notion (automatické opakovanie)",
  review: "Zmena je v D1, Notion vyžaduje kontrolu konfliktu",
  disabled: "Synchronizácia je pre tento profil pozastavená",
  unlinked: "Profil čaká na vytvorenie alebo prepojenie v Notione",
  setup: "Čaká sa na zapnutie databázovej fronty Notion",
};

/** One compact status line, shared by four canonical Help editors. */
export function AdminHelpNotionStatus({ agenda, recordId, revision=0 }: {
  agenda:Agenda; recordId?:number|null; revision?:number;
}) {
  const key = agenda + ":" + recordId + ":" + revision;
  const [snapshot,setSnapshot]=useState<{key:string;state:State|"unavailable"}|null>(null);
  useEffect(()=>{
    if(!recordId)return;
    let active=true;
    let inFlight=false;
    async function refresh(){
      if(inFlight)return;
      inFlight=true;
      try{
        const response=await fetch(
          "/api/admin/notion-help-writeback-status?agenda="+encodeURIComponent(agenda)+
          "&id="+encodeURIComponent(String(recordId)),
          {cache:"no-store"},
        );
        if(!response.ok)throw Error("NOTION_STATUS_UNAVAILABLE");
        const value=await response.json() as {status?:State};
        if(active)setSnapshot({key,state:value.status && Object.hasOwn(captions,value.status)?value.status:"unavailable"});
      }catch{if(active)setSnapshot({key,state:"unavailable"});}
      finally{inFlight=false;}
    }
    void refresh();
    const timer=setInterval(()=>void refresh(),30_000);
    return()=>{active=false;clearInterval(timer)};
  },[agenda,recordId,revision,key]);
  if(!recordId)return null;
  // Never show an acknowledgement belonging to another record/save revision.
  const state:EditorSyncState=snapshot?.key===key?snapshot.state:"checking";
  const label=state==="checking"?"Overujem stav synchronizácie…":state==="unavailable"?"Stav synchronizácie sa nepodarilo overiť.":captions[state];
  return <AdminEditorSyncStatus state={state} label={label} data-admin-help-notion-sync={state}/>;
}
