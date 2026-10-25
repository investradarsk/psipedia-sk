"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import {AdminActionButton} from "@/components/admin-interaction-system";
import {FilePenLine} from "lucide-react";

const DraftDialog=dynamic(()=>import("@/components/admin-lexical-draft-dialog").then(m=>m.AdminLexicalDraftDialog),{ssr:false});

/**
 * Shared opt-in rich drafting affordance. The source textarea remains the
 * canonical editor; each owner decides how to append text to its data format.
 */
export function AdminLexicalAppendButton({onAppend,disabled=false,label="Pripraviť nový text"}:{
  onAppend:(text:string)=>void;
  disabled?:boolean;
  label?:string;
}) {
  const [open,setOpen]=useState(false);
  return <>
    <AdminActionButton variant="secondary" type="button" disabled={disabled} onClick={()=>setOpen(true)}><FilePenLine size={16} aria-hidden="true"/> {label}</AdminActionButton>
    {open&&<DraftDialog open={open} onOpenChange={setOpen} onAppend={onAppend}/>}
  </>;
}
