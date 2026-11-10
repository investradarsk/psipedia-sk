import { invalidateVersionedPublicHtmlCacheUrl } from "./public-html-cache";

/** Invalidate the detail as well as its listing to hide stale published cards. */
export function lifecyclePublicPaths(kind:string, slug:string, category:string):string[] {
  const cleanSlug=encodeURIComponent(slug);
  const cleanCategory=encodeURIComponent(category);
  let paths:string[];
  switch(kind){
    case "directory": paths=[`/adresar/${cleanCategory}/${cleanSlug}`,`/adresar/${cleanCategory}`,"/adresar"];break;
    case "events": paths=[`/podujatia/${cleanSlug}`,"/podujatia"];break;
    case "help": paths=[`/pomoc-psom/${cleanCategory}/${cleanSlug}`,`/pomoc-psom/${cleanCategory}`,"/pomoc-psom"];break;
    case "breeds": paths=[`/plemena/${cleanSlug}`,"/plemena"];break;
    case "articles": {
      const section=cleanCategory==="clanky"?"clanky":cleanCategory;
      paths=[`/${section}/${cleanSlug}`,`/${section}`,"/clanky"];break;
    }
    case "adoptions": paths=[`/pomoc-psom/adopcia/${cleanSlug}`,"/pomoc-psom/adopcia","/pomoc-psom"];break;
    case "lost-found": {
      const base=cleanCategory==="FOUND"?"najdene-psy":"stratene-psy";
      paths=[`/pomoc-psom/${base}/${cleanSlug}`,`/pomoc-psom/${base}`,"/pomoc-psom"];break;
    }
    case "organizations": paths=[`/organizacie/${cleanSlug}`,"/organizacie","/pomoc-psom/utulky"];break;
    default: paths=[];
  }
  return [...new Set([...paths,"/"])];
}
export async function invalidateRecordPublicCache(kind:string,slug:string,category:string,workerVersion?:string) {
  if(!slug)return;
  const paths=lifecyclePublicPaths(kind,slug,category);
  await Promise.allSettled(paths.map(p=>invalidateVersionedPublicHtmlCacheUrl(
    new URL(p,"https://psipedia.sk"),workerVersion)));
}
