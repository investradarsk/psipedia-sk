"use client";
import {useEffect,useState} from "react";

type Extra={id:string;label:string;type:string;value:unknown};
/** Five Notion-only columns have a simple Admin editor, without a lock queue. */
export function AdminBreedNotionExtras({breedId}:{breedId:number}){
  const [fields,setFields]=useState<Extra[]>([]);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState("");
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    let active=true;
    void fetch("/api/admin/breeds/"+breedId+"/notion-extras",{cache:"no-store"})
      .then(async response=>{
        const data=await response.json() as {fields?:Extra[];error?:string};
        if(!response.ok)throw new Error(data.error??"Načítanie sa nepodarilo.");
        if(active)setFields(data.fields??[]);
      })
      .catch(e=>{if(active)setError(e instanceof Error?e.message:"Načítanie zlyhalo.");})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false};
  },[breedId]);
  async function save(field:Extra){
    setBusy(field.id);setError("");setMessage("");
    try{
      const response=await fetch("/api/admin/breeds/"+breedId+"/notion-extras",{
        method:"PUT",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({field:field.id,value:field.value}),
      });
      const result=await response.json() as {ok?:boolean;error?:string};
      if(!response.ok||!result.ok)throw new Error(result.error??"Uloženie sa nepodarilo.");
      setMessage(field.label+" – prenesené do Notionu.");
    }catch(e){setError(e instanceof Error?e.message:"Uloženie zlyhalo.");}
    finally{setBusy("");}
  }
  function update(fieldId:string,value:unknown){
    setFields(existing=>existing.map(f=>f.id===fieldId?{...f,value}:f));
    setMessage("");
  }
  return <section className="admin-form-card" aria-label="Doplnkové polia Notion">
    <h2>Doplnkové polia Notion</h2>
    <p>Päť pomocných údajov z Notionu, ktoré nemajú vlastné miesto v klasickom editore. Ukladajú sa samostatne bez blokovania ostatných polí.</p>
    {loading?<p>Načítavam doplnkové údaje…</p>:null}
    {error?<p role="alert" className="admin-form-error">{error}</p>:null}
    {message?<p role="status" className="admin-flash">{message}</p>:null}
    {fields.map(field=><div key={field.id} className="admin-field">
      <label>
        <span>{field.label}</span>
        {field.type==="checkbox"
          ?<input type="checkbox" checked={field.value===true}
              onChange={e=>update(field.id,e.target.checked)} />
          :field.type==="url"
            ?<input type="url" value={String(field.value??"")}
                onChange={e=>update(field.id,e.target.value)}/>
            :<textarea rows={2} value={String(field.value??"")}
                onChange={e=>update(field.id,e.target.value)}/>}
      </label>
      <button type="button" disabled={Boolean(busy)} onClick={()=>void save(field)}>
        {busy===field.id?"Ukladám…":"Uložiť do Notionu"}
      </button>
    </div>)}
  </section>;
}
