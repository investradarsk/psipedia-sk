import { notionBreedRichTextProperty } from "./notion-breed-text";

/**
 * Temporary read adapter for Notion's 109 -> 60 field transition.
 * Legacy source cells remain authoritative until the public, D1 and
 * Notion adapters have been atomically cut over. Never delete a merged
 * suffix unless every mirrored source is still present and identical.
 */
const STAGED_BY_TARGET: Record<string, readonly (readonly [string, string])[]> = {
  "FCI zdroj poznámka": [
    ["FCI chov poznámka", "Chov podľa FCI"],
    ["FCI nomenklatúra URL", "FCI nomenklatúra – zdroj"],
    ["FCI skupina názov", "Názov skupiny FCI"],
    ["FCI status", "Stav plemena podľa FCI"],
    ["FCI veľkosť a hmotnosť poznámka", "Veľkosť a hmotnosť podľa FCI"],
    ["Platnosť FCI štandardu", "Dátum platnosti štandardu FCI"],
  ],
  "FCI telo": [
    ["FCI chvost", "Chvost podľa FCI"],
    ["FCI krk", "Krk podľa FCI"],
  ],
  "História": [["FCI historický súhrn", "Historický súhrn podľa FCI"]],
  "FCI srsť": [["FCI koža", "Koža podľa FCI"]],
  "FCI lebka": [
    ["FCI oči", "Oči podľa FCI"],
    ["FCI tvár", "Tvárová časť podľa FCI"],
    ["FCI uši", "Uši podľa FCI"],
  ],
  "FCI sekcia": [
    ["FCI sekcia názov", "Názov sekcie FCI"],
    ["FCI sekcia číslo", "Číslo sekcie FCI"],
  ],
  "Výcvik": [
    ["FCI využitie", "Pôvodné využitie podľa FCI"],
    ["Pracovná skúška", "Pracovná skúška"],
    ["Redakcia tip výcvik", "Praktický tip k výcviku"],
  ],
  "Redakcia prehľad": [
    ["Potreby", "Každodenné potreby"],
    ["Skupina", "Kategória plemena"],
  ],
  "Pohyb": [["Redakcia tip pohyb", "Praktický tip k pohybu"]],
  "Redakcia starostlivosť o srsť": [
    ["Redakcia tip srsť", "Praktický tip k srsti"],
  ],
  "Zdravie": [["Redakcia tip zdravie", "Praktický tip k zdraviu"]],
};

type BreedNotionPage = { properties?: Record<string, unknown> };

function sourceValue(page: BreedNotionPage, name: string): string {
  const prop=page.properties?.[name];
  if (!prop || typeof prop!=="object") return "";
  const row=prop as Record<string,unknown>;
  if (typeof row.url==="string") return row.url.trim();
  if (typeof row.number==="number" && Number.isFinite(row.number))return String(row.number);
  if (row.date && typeof row.date==="object") {
    const start=(row.date as Record<string,unknown>).start;
    return typeof start==="string"?start.trim():"";
  }
  if (row.select && typeof row.select==="object") {
    const value=(row.select as Record<string,unknown>).name;
    return typeof value==="string"?value.trim():"";
  }
  return notionBreedRichTextProperty(page,name);
}
function normalizeSameUrl(text:string):string {
  return text.replace(
    /\[(https?:\/\/[^\]]+)\]\((https?:\/\/[^)]+)\)/gu,
    (whole:string,label:string,href:string)=>label===href?href:whole,
  );
}
export function inspectNotionStagedBreedField(
  page: BreedNotionPage,
  target: string,
): { value: string; staged: boolean; valid: boolean } {
  const value=notionBreedRichTextProperty(page,target);
  const sources=STAGED_BY_TARGET[target];
  if (!sources || !value)return {value,staged:false,valid:true};
  const markers=sources.map(([source,heading])=>({
    source,marker:" — "+heading+": ",
  }));
  const first=Math.min(...markers.map(x=> {
    const n=value.indexOf(x.marker);
    return n<0?Infinity:n;
  }));
  if (!Number.isFinite(first))return {value,staged:false,valid:true};
  // Every staged piece must be a complete, contiguous, source-matched
  // subsection. A missing/modified source blocks only this target.
  let cursor=first;
  const seen=new Set<string>();
  while(cursor<value.length){
    const current=markers.find(x=>value.startsWith(x.marker,cursor));
    if (!current || seen.has(current.source))
      return {value,staged:true,valid:false};
    seen.add(current.source);
    const start=cursor+current.marker.length;
    const next=Math.min(value.length,...markers.map(x=>{
      const n=value.indexOf(x.marker,start);
      return n<0?Infinity:n;
    }));
    const stored=value.slice(start,next).trim();
    const original=sourceValue(page,current.source);
    if (!original || normalizeSameUrl(stored)!==normalizeSameUrl(original))
      return {value,staged:true,valid:false};
    cursor=next;
  }
  return {value:value.slice(0,first).trimEnd(),staged:true,valid:true};
}

/** Return only the unmerged canonical part while old mirrors still exist. */
export function readNotionStagedBreedField(page:BreedNotionPage,target:string):string {
  const result=inspectNotionStagedBreedField(page,target);
  return result.valid?result.value:notionBreedRichTextProperty(page,target);
}
export function invalidNotionStagedBreedTargets(page:BreedNotionPage):string[]{
  return Object.keys(STAGED_BY_TARGET)
    .filter(target=>!inspectNotionStagedBreedField(page,target).valid);
}
export const NOTION_BREED_STAGED_MERGE_KEYS=STAGED_BY_TARGET;
