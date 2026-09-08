// Only resolve owned assets through bindings; never fetch an arbitrary stored URL from the Worker.
export type ImageBindings = { BUCKET?: {head(key:string):Promise<unknown>;list?(options:{prefix:string;limit:number;cursor?:string}):Promise<{objects:Array<{key:string}>;truncated:boolean;cursor?:string}>}; ASSETS?:{fetch(request:Request):Promise<Response>} };
const caches=new WeakMap<object,Map<string,{expires:number;value:Promise<string>}>>();
export function ownedBreedImage(raw:string|null|undefined):string {
  const value=raw?.trim()??'';
  if(!value)return '';
  try{
    const url=new URL(value,'https://psipedia.sk');
    return url.origin==='https://psipedia.sk'&&/^\/(media|images|migrated-media)\//.test(url.pathname)?value:'';
  }catch{return '';}
}
export async function availableBreedImage(raw:string|null|undefined,bindings:ImageBindings):Promise<string> {
  const value=ownedBreedImage(raw);
  if(!value)return '';
  const url=new URL(value,'https://psipedia.sk');
  if(!bindings.BUCKET&&!bindings.ASSETS)return value; // Offline seed preview; client still handles failures.
  const owner=bindings.BUCKET??bindings.ASSETS!;
  let cache=caches.get(owner);if(!cache){cache=new Map();caches.set(owner,cache);}
  const cached=cache.get(value);if(cached&&cached.expires>Date.now())return cached.value;
  if(cache.size>=512)cache.delete(cache.keys().next().value!);
  const pending=(async()=>{
    try{
      if(url.pathname.startsWith('/media/'))return bindings.BUCKET&&await bindings.BUCKET.head(decodeURIComponent(url.pathname.slice(7)))?value:'';
      if(!bindings.ASSETS)return '';
      const response=await bindings.ASSETS.fetch(new Request(url,{method:'HEAD'}));
      return response.ok&&/^image\//i.test(response.headers.get('content-type')??'')?value:'';
    }catch{return '';}
  })();
  const entry={expires:Date.now()+300000,value:pending};cache.set(value,entry);
  const result=await pending;if(!result)entry.expires=Date.now()+30000;
  return result;
}

export async function withAvailableBreedImages<T extends {image:string}>(items:T[],bindings:ImageBindings):Promise<T[]> {
  // Bulk pages use a bounded inventory listing instead of hundreds of R2 HEAD subrequests.
  const media=items.map(item=>item.image?.trim()).filter((value):value is string=>Boolean(value?.startsWith('/media/')));
  if(media.length>8 && bindings.BUCKET?.list){
    const owner=bindings.BUCKET;
    let cache=caches.get(owner);if(!cache){cache=new Map();caches.set(owner,cache);}
    const pending=media.filter(value=>!cache!.has(value)||cache!.get(value)!.expires<=Date.now());
    if(pending.length>8){
      const keys=pending.map(value=>{try{return decodeURIComponent(new URL(value,'https://psipedia.sk').pathname.slice(7));}catch{return '';}});
      let prefix=keys[0].slice(0,keys[0].lastIndexOf('/')+1);
      while(prefix && !keys.every(key=>key.startsWith(prefix)))prefix=prefix.slice(0,prefix.slice(0,-1).lastIndexOf('/')+1);
      const found=new Set<string>();let cursor:string|undefined;let complete=false;
      try{
        for(let page=0;page<20;page++){
          const result=await owner.list!({prefix,limit:1000,...(cursor?{cursor}:{})});
          for(const object of result.objects)found.add(object.key);
          if(!result.truncated){complete=true;break;}cursor=result.cursor;
          if(!cursor)break;
        }
      }catch{/* An unavailable inventory produces placeholders; it does not prove a file is missing. */}
      pending.forEach((value,index)=>cache!.set(value,{expires:Date.now()+(complete?300000:30000),value:Promise.resolve(found.has(keys[index])?value:'')}));
    }
  }
  const result=items.slice();let next=0;
  await Promise.all(Array.from({length:Math.min(8,items.length)},async()=>{
    while(next<items.length){const index=next++;result[index]={...items[index],image:await availableBreedImage(items[index].image,bindings)};}
  }));
  return result;
}
