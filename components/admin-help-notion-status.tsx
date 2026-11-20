"use client";

import { useEffect, useState } from "react";

type Agenda = "organizations" | "adoptions" | "help-cases" | "lost-found";
type State = "synced" | "pending" | "review" | "disabled" | "unlinked" | "setup";

const captions: Record<State,string> = {
  synced: "✓ Notion synchronizovaný",
  pending: "⏳ Uložené v D1 · čaká sa na Notion (automatické opakovanie)",
  review: "⚠️ Zmena je v D1, Notion vyžaduje kontrolu konfliktu",
  disabled: "Notion synchronizácia je pre tento profil pozastavená",
  unlinked: "Nový profil čaká na hodinové vytvorenie alebo prepojenie v Notione",
  setup: "⚠️ Čaká sa na zapnutie databázovej fronty Notion",
};

/** One compact status line, shared by four canonical Help editors. */
export function AdminHelpNotionStatus({ agenda, recordId, revision=0 }: {
  agenda:Agenda; recordId?:number|null; revision?:number;
}) {
  const [state,setState]=useState<State|null>(null);
  useEffect(()=>{
    if(!recordId)return;
    let active=true;
    async function refresh(){
      try{
        const response=await fetch(
          "/api/admin/notion-help-writeback-status?agenda="+encodeURIComponent(agenda)+
          "&id="+encodeURIComponent(String(recordId)),
          {cache:"no-store"},
        );
        if(!response.ok)throw Error("NOTION_STATUS_UNAVAILABLE");
        const value=await response.json() as {status?:State};
        if(active)setState(value.status && Object.hasOwn(captions,value.status)?value.status:null);
      }catch{if(active)setState(null);}
    }
    void refresh();
    const timer=setInterval(()=>void refresh(),30_000);
    return()=>{active=false;clearInterval(timer)};
  },[agenda,recordId,revision]);
  if(!recordId || !state)return null;
  return <p className="admin-help" role="status" aria-live="polite"
    data-admin-help-notion-sync={state}>{captions[state]}</p>;
}
