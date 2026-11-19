"use client";
import {useEffect,useMemo,useState} from "react";
import {useRouter} from "next/navigation";
import {createAdminPartnerResourceSearch,type AdminPartnerResource} from "@/lib/partner-admin-resource-search";

export function AdminPartnerAccountActions({accountId,status,memberships}:{accountId:string;status:string;memberships:Array<{id:string;role:string;revokedAt?:string|null}>}){
  const router=useRouter();
  const [message,setMessage]=useState("");
  const [mutationBusy,setMutationBusy]=useState(false);
  const [searchBusy,setSearchBusy]=useState(false);
  const [q,setQ]=useState("");
  const [resources,setResources]=useState<AdminPartnerResource[]>([]);
  const [searched,setSearched]=useState(false);
  const [selected,setSelected]=useState<AdminPartnerResource|null>(null);
  const busy=mutationBusy||searchBusy;
  const resourceSearch=useMemo(()=>createAdminPartnerResourceSearch({
    onLoading:setSearchBusy,
    onResults:items=>{setResources(items);setSearched(true);setMessage("");},
    onError:error=>{setSearched(true);setMessage(error);},
  }),[]);
  useEffect(()=>()=>resourceSearch.cancel(true),[resourceSearch]);

  async function request(url:string,init:RequestInit){
    setMutationBusy(true);setMessage("");
    try{
      const r=await fetch(url,{...init,headers:{"content-type":"application/json",...(init.headers??{})}});
      const j=await r.json() as {error?:string};
      if(!r.ok)throw new Error(j.error||"Operácia zlyhala.");
      setMessage("Zmena bola uložená.");router.refresh();return true;
    }catch(e){setMessage(e instanceof Error?e.message:"Operácia zlyhala.");return false;}
    finally{setMutationBusy(false);}
  }
  async function lifecycle(action:string){
    if(!confirm("Naozaj vykonať túto bezpečnostnú akciu?"))return;
    await request(`/api/admin/partners/accounts/${accountId}/status`,{method:"POST",body:JSON.stringify({action})});
  }
  function search(){
    setResources([]);setSelected(null);setSearched(false);setMessage("");
    void resourceSearch.run(q.trim());
  }
  async function add(){
    if(!selected)return;
    if(await request("/api/admin/partners/memberships",{method:"POST",body:JSON.stringify({accountId,entityType:selected.entityType,canonicalId:selected.id,role:"OWNER"})})){setSelected(null);setResources([]);setSearched(false);}
  }
  return <div className="admin-partner-actions">
    <section className="admin-form-card"><h2>Bezpečnostné akcie</h2><div className="admin-partner-button-row">
      {status==="ACTIVE"&&<button disabled={busy} onClick={()=>lifecycle("SUSPEND")}>Suspendovať</button>}
      {status==="SUSPENDED"&&<button disabled={busy} onClick={()=>lifecycle("REACTIVATE")}>Reaktivovať</button>}
      <button disabled={busy} onClick={()=>lifecycle("REVOKE_SESSIONS")}>Odhlásiť zo všetkých zariadení</button>
      {status!=="DEACTIVATED"&&<button className="is-danger" disabled={busy} onClick={()=>lifecycle("DEACTIVATE")}>Deaktivovať</button>}
    </div></section>
    <section className="admin-form-card"><h2>Priradiť profil alebo podujatie</h2><div className="admin-partner-picker">
      <label>Hľadať podľa názvu profilu alebo podujatia
        <input value={q} onChange={e=>{
          resourceSearch.cancel();
          setQ(e.target.value);
          setResources([]);
          setSelected(null);
          setSearched(false);
        }}/>
      </label>
      <button disabled={busy||q.trim().length<2} onClick={search}>Hľadať</button>
    </div>
      {searched&&!searchBusy&&!message&&!resources.length&&<p className="admin-partner-empty" role="status">Nenašiel sa žiadny zodpovedajúci profil ani podujatie. Skúste iný názov.</p>}
      {resources.length>0&&<div className="admin-partner-results">{resources.map(r=><button key={`${r.entityType}:${r.id}`} onClick={()=>setSelected(r)} aria-pressed={selected?.id===r.id&&selected.entityType===r.entityType}><strong>{r.name}</strong><small>{r.entityType} · {r.status}</small></button>)}</div>}
      {selected&&<div className="admin-partner-picker"><span>Rola: Správca profilu</span><button disabled={busy||status!=="ACTIVE"} onClick={add}>Priradiť {selected.name}</button></div>}
      {status!=="ACTIVE"&&<p className="admin-partner-empty">Účet nie je aktívny. Pred priradením profilu ho najprv reaktivujte.</p>}
    </section>
    <section className="admin-form-card"><h2>Správa pridelených prístupov</h2>{memberships.filter(m=>!m.revokedAt).length===0?<p className="admin-partner-empty">Tento účet zatiaľ nespravuje žiadny profil ani podujatie.</p>:memberships.filter(m=>!m.revokedAt).map(m=><div className="admin-partner-membership" key={m.id}><code>{m.id.slice(0,8)}</code><span>{m.role==="OWNER"?"Správca profilu":`Historická rola: ${m.role}`}</span>{m.role!=="OWNER"&&<button disabled={busy} onClick={()=>request(`/api/admin/partners/memberships/${m.id}`,{method:"PATCH",body:JSON.stringify({role:"OWNER"})})}>Nastaviť správcu</button>}<button disabled={busy} onClick={()=>confirm("Odvolať prístup k profilu?")&&request(`/api/admin/partners/memberships/${m.id}`,{method:"PATCH",body:JSON.stringify({revoke:true})})}>Odvolať</button></div>)}</section>
    {message&&<p role="status" className="admin-partner-message">{message}</p>}
  </div>;
}
