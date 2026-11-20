"use client";

import Link from "next/link";
import {useEffect,useId,useState} from "react";
import {useRouter} from "next/navigation";
import type {PartnerClaimableResourceType} from "@/lib/partner-claims";
import type {PartnerClaimSearchItem} from "@/lib/partner-claim-search";

type Choice={value:PartnerClaimableResourceType;label:string};
type Props={choices:Choice[];initialType:PartnerClaimableResourceType;initialQuery:string};

/** Keyboard-accessible suggestions. Form submission remains available if JavaScript or suggestions fail. */
export function PartnerClaimSearchForm({choices,initialType,initialQuery}:Props){
  const router=useRouter();
  const [type,setType]=useState<PartnerClaimableResourceType>(initialType);
  const [query,setQuery]=useState(initialQuery);
  const [items,setItems]=useState<PartnerClaimSearchItem[]>([]);
  const [open,setOpen]=useState(false);
  const [active,setActive]=useState(-1);
  const [loading,setLoading]=useState(false);
  const listId=useId();
  useEffect(()=>{
    const clean=query.trim();
    if(!clean){setItems([]);setLoading(false);setOpen(false);return;}
    const controller=new AbortController();
    let current=true;
    const timeout=setTimeout(async()=>{
      setLoading(true);
      try{
        const response=await fetch("/api/partner/claim-search?type="+encodeURIComponent(type)+"&q="+encodeURIComponent(clean),{
          cache:"no-store",signal:controller.signal,
        });
        if(!response.ok)throw new Error("Vyhľadávanie sa nepodarilo.");
        const data=await response.json() as {items?:PartnerClaimSearchItem[]};
        if(current){setItems(data.items??[]);setActive(-1);setOpen(true);}
      }catch{
        if(current){setItems([]);setOpen(false);}
      }finally{if(current)setLoading(false);}
    },180);
    return ()=>{current=false;clearTimeout(timeout);controller.abort();};
  },[query,type]);

  const show=open&&items.length>0;
  return <form method="get" action="/partner/prevziat" role="search" className="partner-claim-search-form">
    <label className="partner-field">
      <span>Oblasť</span>
      <select name="type" value={type} onChange={event=>{
        setType(event.target.value as PartnerClaimableResourceType);
        setItems([]);setOpen(false);setActive(-1);
      }}>
        {choices.map(choice=><option key={choice.value} value={choice.value}>{choice.label}</option>)}
      </select>
    </label>
    <div className="partner-claim-autosuggest">
      <label className="partner-field" htmlFor="partner-claim-query">
        <span>Názov záznamu alebo mesto</span>
      </label>
      <input id="partner-claim-query" name="q" type="search" minLength={1} maxLength={80}
        placeholder="Začnite písať, napr. V…" autoComplete="off" value={query}
        role="combobox" aria-autocomplete="list" aria-controls={listId}
        aria-expanded={show} aria-activedescendant={show&&active>=0?`${listId}-${active}`:undefined}
        onChange={event=>{setQuery(event.target.value);setOpen(true);setActive(-1);}}
        onFocus={()=>{if(items.length)setOpen(true);}}
        onKeyDown={event=>{
          if(event.key==="Escape"){setOpen(false);setActive(-1);return;}
          if(!show)return;
          if(event.key==="ArrowDown"){event.preventDefault();setActive(old=>(old+1)%items.length);}
          else if(event.key==="ArrowUp"){event.preventDefault();setActive(old=>old<=0?items.length-1:old-1);}
          else if(event.key==="Enter"&&active>=0){event.preventDefault();router.push(items[active].claimHref);}
        }}/>
      {show&&<ul id={listId} className="partner-claim-suggestions" role="listbox" aria-label="Nájdené profily">
        {items.map((item,i)=><li key={item.entityType+":"+item.canonicalId} role="presentation">
          <Link id={`${listId}-${i}`} href={item.claimHref} role="option" aria-selected={active===i}
            onMouseEnter={()=>setActive(i)} onMouseDown={event=>event.preventDefault()}>
            <strong>{item.name}</strong><small>{item.details}</small>
          </Link>
        </li>)}
      </ul>}
      {loading&&<p className="partner-claim-suggest-note" role="status">Hľadám záznamy…</p>}
      {!loading&&open&&query.trim()&&items.length===0&&
        <p className="partner-claim-suggest-note" role="status">Žiadna zhoda. Skúste celý názov alebo iné mesto.</p>}
    </div>
    <button className="button button--dark" type="submit">Vyhľadať</button>
  </form>;
}
