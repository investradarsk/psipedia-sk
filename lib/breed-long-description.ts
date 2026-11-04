/**
 * Breed profile long-form content.
 *
 * Notion editorials can be significantly longer than a 240-character bullet.
 * Never silently slice these fields: that would publish incomplete veterinary
 * or FCI information and make post-transfer readback permanently fail.
 */
export const BREED_COAT_MAX_LENGTH=2000;
export const BREED_LIST_ITEM_MAX_LENGTH=2000;
export const BREED_LIST_MAX_ITEMS=30;

function richText(value:unknown,max:number,label:string):string {
  const result=String(value??"").trim();
  if(result.length>max)
    throw new Error(`${label} presahuje limit ${max} znakov – skráť text alebo ho rozdeľ na položky.`);
  return result;
}

/** Full (up to 2000 characters) coat description, without silent truncation. */
export function cleanBreedCoatDescription(value:unknown):string {
  return richText(value,BREED_COAT_MAX_LENGTH,"Srsť");
}

/** Long-form health risks, suitability and considerations remain intact. */
export function cleanBreedEditorialList(value:unknown):string[] {
  if(!Array.isArray(value))return [];
  const items=value
    .map(item=>richText(item,BREED_LIST_ITEM_MAX_LENGTH,"Odborná položka"))
    .filter(Boolean);
  if(items.length>BREED_LIST_MAX_ITEMS)
    throw new Error(`Odborný zoznam obsahuje viac než ${BREED_LIST_MAX_ITEMS} položiek.`);
  return items;
}
