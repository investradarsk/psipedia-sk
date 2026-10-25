/** Stable sortable identities independent of list indexes. Duplicate URLs remain distinct. */
export function gallerySortableIds(urls: readonly string[]): string[] {
  const counts=new Map<string,number>();
  return urls.map(url=>{
    const occurrence=counts.get(url)??0;
    counts.set(url,occurrence+1);
    return url.length+":"+url+":"+occurrence;
  });
}
