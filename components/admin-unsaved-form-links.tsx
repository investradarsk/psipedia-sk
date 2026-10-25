"use client";
import {useCallback,useRef,useState,type FormEvent,type MouseEvent} from "react";

/** Centralize unsaved form navigation without changing the editor's API writes. */
export function useAdminUnsavedFormLinks() {
  const [dirty,setDirty]=useState(false);
  const [confirmOpen,setConfirmOpen]=useState(false);
  const pendingAnchor=useRef<HTMLAnchorElement|null>(null);
  const replayingClick=useRef(false);
  const allowNativeExitRef=useRef(false);
  const markDirty=useCallback(()=>{allowNativeExitRef.current=false;setDirty(true);},[]);
  const markSaved=useCallback(()=>setDirty(false),[]);
  const markSavedBeforeRedirect=useCallback(()=>{
    allowNativeExitRef.current=true;
    setDirty(false);
  },[]);
  const captureChange=useCallback((event:FormEvent<HTMLFormElement>)=>{
    // A selected file is not yet a successful upload.
    if(event.target instanceof HTMLInputElement && event.target.type==="file")return;
    markDirty();
  },[markDirty]);
  const captureLinkClick=useCallback((event:MouseEvent<HTMLFormElement>)=>{
    if(!dirty||replayingClick.current||event.defaultPrevented||event.button!==0||
       event.ctrlKey||event.altKey||event.metaKey||event.shiftKey)return;
    const target=event.target;
    const anchor=target instanceof Element?target.closest<HTMLAnchorElement>("a[href]"):null;
    if(!anchor||anchor.hasAttribute("download")||(anchor.target&&anchor.target!=="_self"))return;
    const destination=new URL(anchor.href,window.location.href);
    const current=window.location;
    if(destination.origin!==current.origin||
       (destination.pathname===current.pathname&&destination.search===current.search))return;
    event.preventDefault();
    pendingAnchor.current=anchor;
    setConfirmOpen(true);
  },[dirty]);
  const stay=useCallback(()=>{pendingAnchor.current=null;setConfirmOpen(false);},[]);
  const discard=useCallback(()=>{
    const anchor=pendingAnchor.current;
    pendingAnchor.current=null;
    setConfirmOpen(false);
    setDirty(false);
    if(!anchor)return;
    replayingClick.current=true;
    try{anchor.click();}finally{replayingClick.current=false;}
  },[]);
  return{dirty,confirmOpen,allowNativeExitRef,markDirty,markSaved,markSavedBeforeRedirect,
    captureChange,captureLinkClick,stay,discard};
}
