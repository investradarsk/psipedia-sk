"use client";
import { useEffect } from "react";

/** Native reload/close and ordinary Next Link navigation.
 * No autosave: partners explicitly choose Uložiť.
 */
export function usePartnerUnsavedGuard(dirty:boolean,enabled=true){
  useEffect(()=>{
    if(!enabled||!dirty)return;
    const before=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
    const click=(event:MouseEvent)=>{
      if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
      const element=event.target;
      if(!(element instanceof Element))return;
      const link=element.closest<HTMLAnchorElement>("a[href]");
      if(!link||link.hasAttribute("download")||link.target==="_blank")return;
      const destination=new URL(link.href,window.location.href);
      if(destination.href===window.location.href)return;
      if(!window.confirm("Máte neuložené zmeny. Naozaj chcete odísť?")){
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload",before);
    document.addEventListener("click",click,true);
    return ()=>{
      window.removeEventListener("beforeunload",before);
      document.removeEventListener("click",click,true);
    };
  },[dirty,enabled]);
}
