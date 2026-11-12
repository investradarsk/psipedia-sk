"use client";
import {useCallback,useRef,useState,type FormEvent} from "react";
import {useAdminEditorNavigationGuard} from "@/components/admin-editor-navigation-guard";

/** Keep revision tracking in one place; use the document-wide exit guard. */
export function useAdminUnsavedFormLinks() {
  const [dirty,setDirty]=useState(false);
  const editRevisionRef=useRef(0);
  const allowNativeExitRef=useRef(false);
  const navigation=useAdminEditorNavigationGuard({dirty,allowNativeExitRef});
  const markDirty=useCallback(()=>{
    editRevisionRef.current+=1;
    allowNativeExitRef.current=false;
    setDirty(true);
  },[]);
  const markSaved=useCallback(()=>setDirty(false),[]);
  const getRevision=useCallback(()=>editRevisionRef.current,[]);
  const markSavedIfUnchanged=useCallback((submittedRevision:number)=>{
    if(editRevisionRef.current!==submittedRevision)return false;
    setDirty(false);
    return true;
  },[]);
  const markSavedBeforeRedirect=useCallback(()=>{
    // Successful creation may redirect before React commits clean state.
    allowNativeExitRef.current=true;
    setDirty(false);
  },[]);
  const captureChange=useCallback((event:FormEvent<HTMLFormElement>)=>{
    if(event.target instanceof HTMLInputElement && event.target.type==="file")return;
    markDirty();
  },[markDirty]);
  return {
    dirty,confirmOpen:navigation.confirmOpen,allowNativeExitRef,
    markDirty,markSaved,markSavedIfUnchanged,getRevision,markSavedBeforeRedirect,
    captureChange,stay:navigation.stay,discard:navigation.discard,
  };
}
