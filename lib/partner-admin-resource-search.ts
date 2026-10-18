// Client-only request coordinator. Latest search wins, and every terminal path
// (HTTP error, JSON parse error, network failure, abort or timeout) clears loading.
export type AdminPartnerResource={entityType:string;id:number;name:string;slug:string;status:string};
type SearchCallbacks={
  onLoading:(loading:boolean)=>void;
  onResults:(items:AdminPartnerResource[])=>void;
  onError:(message:string)=>void;
};
type FetchLike=typeof fetch;

export function createAdminPartnerResourceSearch(
  callbacks:SearchCallbacks,
  options:{fetcher?:FetchLike;timeoutMs?:number}={},
){
  const fetcher=options.fetcher??fetch;
  const timeoutMs=options.timeoutMs??15000;
  let sequence=0;
  let active:AbortController|null=null;
  function cancel(silent=false){
    sequence++;
    active?.abort();
    active=null;
    if(!silent)callbacks.onLoading(false);
  }
  async function run(query:string){
    cancel();
    const token=sequence;
    const controller=new AbortController();
    active=controller;
    let timedOut=false;
    const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
    callbacks.onLoading(true);
    try{
      const response=await fetcher("/api/admin/partners/resources?q="+encodeURIComponent(query),{
        signal:controller.signal,
        cache:"no-store",
      });
      if(!response.ok)throw new Error("HTTP "+response.status);
      const payload=await response.json() as {items?:unknown};
      if(token!==sequence)return;
      if(controller.signal.aborted)throw new Error("Search aborted or timed out");
      if(!Array.isArray(payload.items))throw new Error("Invalid resources response");
      callbacks.onResults(payload.items as AdminPartnerResource[]);
    }catch{
      if(token===sequence){
        callbacks.onError(timedOut?"Vyhľadávanie prekročilo časový limit. Skúste to znova.":"Vyhľadávanie zdrojov zlyhalo. Skúste to znova.");
      }
    }finally{
      clearTimeout(timer);
      if(token===sequence){
        active=null;
        callbacks.onLoading(false);
      }
    }
  }
  return {run,cancel};
}
