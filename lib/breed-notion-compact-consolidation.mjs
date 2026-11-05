/**
 * Lossless Notion breed-field consolidation contract.
 *
 * There are 60 visible editorial properties and 49 hidden legacy/operational
 * properties. Do NOT drop fields merely because they are hidden.
 * Run a complete backup, dry-run and readback verification before any schema
 * deletion; actively used technical fields are explicitly retained.
 *
 * This module has no network or persistence side effects.
 */
export const BREED_COMPACT_VISIBLE = Object.freeze([
  "Názov",
  "FCI číslo",
  "FCI skupina",
  "FCI sekcia",
  "Krajina pôvodu",
  "Oficiálny FCI názov",
  "Veľkosť",
  "Výška",
  "Hmotnosť",
  "Dĺžka života",
  "Srsť",
  "Energia",
  "Trénovateľnosť",
  "Deti",
  "Iné psy",
  "Byt",
  "Starostlivosť o srsť",
  "Pĺznutie",
  "Lovecký pud",
  "Intro",
  "Redakcia prehľad",
  "Charakter",
  "História",
  "Pohyb",
  "Výcvik",
  "Zdravie",
  "Zdravotné riziká",
  "Vhodné pre",
  "Zvážiť",
  "Redakcia spolužitie so psami",
  "Redakcia starostlivosť o srsť",
  "Redakcia chyby majiteľov",
  "Redakcia zaujímavosti",
  "Redakcia život v rodine",
  "Hlavný obrázok URL",
  "Galéria JSON",
  "Športy JSON",
  "Zdroje",
  "FCI celkový vzhľad",
  "FCI proporcie",
  "FCI povaha a temperament",
  "FCI lebka",
  "FCI telo",
  "FCI predné končatiny",
  "FCI zadné končatiny",
  "FCI pohyb",
  "FCI srsť",
  "FCI farba",
  "FCI výška pes cm",
  "FCI výška suka cm",
  "FCI hmotnosť pes kg",
  "FCI hmotnosť suka kg",
  "FCI chyby",
  "FCI závažné chyby",
  "FCI diskvalifikačné chyby",
  "FCI štandard PDF",
  "FCI zdroj poznámka",
  "Editorial complete",
  "SEO title",
  "Meta description"
]);
export const BREED_COMPACT_HIDDEN = Object.freeze([
  "Alt text obrázka",
  "FCI chov poznámka",
  "FCI chvost",
  "FCI historický súhrn",
  "FCI koža",
  "FCI krk",
  "FCI nomenklatúra URL",
  "FCI oči",
  "FCI sekcia názov",
  "FCI sekcia číslo",
  "FCI skupina názov",
  "FCI status",
  "FCI tvár",
  "FCI uši",
  "FCI veľkosť a hmotnosť poznámka",
  "FCI využitie",
  "FCI štandard JSON",
  "Farba akcentu",
  "Import kľúč",
  "Odborný reaudit 2026",
  "Platnosť FCI štandardu",
  "Posledný sync",
  "Potreby",
  "Poznámky",
  "Pracovná skúška",
  "Profil skvalitnený",
  "Psipedia ID",
  "Redakcia hlavné vlastnosti JSON",
  "Redakcia tip pohyb",
  "Redakcia tip srsť",
  "Redakcia tip výcvik",
  "Redakcia tip zdravie",
  "Redakčné sekcie JSON",
  "Rodina",
  "SEO OG description",
  "SEO OG title",
  "SEO canonical URL",
  "SEO focus keyword",
  "SEO noindex",
  "Skupina",
  "Slug",
  "Stav",
  "Sync chyba",
  "Sync stav",
  "Súvisiace plemená ID",
  "Súvisiace profily služieb ID",
  "Súvisiace články ID",
  "URL Psipedia",
  "Zdroj obrázka"
]);
export const BREED_COMPACT_MERGE = Object.freeze({
  "FCI chov poznámka": "FCI zdroj poznámka",
  "FCI chvost": "FCI telo",
  "FCI historický súhrn": "História",
  "FCI koža": "FCI srsť",
  "FCI krk": "FCI telo",
  "FCI nomenklatúra URL": "FCI zdroj poznámka",
  "FCI oči": "FCI lebka",
  "FCI sekcia názov": "FCI sekcia",
  "FCI sekcia číslo": "FCI sekcia",
  "FCI skupina názov": "FCI zdroj poznámka",
  "FCI status": "FCI zdroj poznámka",
  "FCI tvár": "FCI lebka",
  "FCI uši": "FCI lebka",
  "FCI veľkosť a hmotnosť poznámka": "FCI zdroj poznámka",
  "FCI využitie": "Výcvik",
  "Platnosť FCI štandardu": "FCI zdroj poznámka",
  "Potreby": "Redakcia prehľad",
  "Pracovná skúška": "Výcvik",
  "Redakcia tip pohyb": "Pohyb",
  "Redakcia tip srsť": "Redakcia starostlivosť o srsť",
  "Redakcia tip výcvik": "Výcvik",
  "Redakcia tip zdravie": "Zdravie",
  "Skupina": "Redakcia prehľad"
});
export const BREED_COMPACT_OPERATIONAL = Object.freeze([
  "Alt text obrázka",
  "Farba akcentu",
  "Import kľúč",
  "Poznámky",
  "Psipedia ID",
  "Posledný sync",
  "Redakcia hlavné vlastnosti JSON",
  "SEO OG description",
  "SEO OG title",
  "SEO focus keyword",
  "SEO noindex",
  "Slug",
  "Stav",
  "Sync chyba",
  "Sync stav",
  "Súvisiace plemená ID",
  "Súvisiace profily služieb ID",
  "Súvisiace články ID",
  "URL Psipedia",
  "Zdroj obrázka"
]);
export const BREED_COMPACT_RETIRE_AFTER_AUDIT = Object.freeze([
  "FCI štandard JSON",
  "Odborný reaudit 2026",
  "Profil skvalitnený",
  "Redakčné sekcie JSON",
  "Rodina",
  "SEO canonical URL"
]);

const forbidden = new Set(["__proto__", "constructor", "prototype"]);
/** Human-readable, unique section headings — not machine-facing debug tags. */
export const BREED_COMPACT_HEADINGS = Object.freeze({
  "FCI chov poznámka": "Chov podľa FCI",
  "FCI chvost": "Chvost podľa FCI",
  "FCI historický súhrn": "Historický súhrn podľa FCI",
  "FCI koža": "Koža podľa FCI",
  "FCI krk": "Krk podľa FCI",
  "FCI nomenklatúra URL": "FCI nomenklatúra – zdroj",
  "FCI oči": "Oči podľa FCI",
  "FCI sekcia názov": "Názov sekcie FCI",
  "FCI sekcia číslo": "Číslo sekcie FCI",
  "FCI skupina názov": "Názov skupiny FCI",
  "FCI status": "Stav plemena podľa FCI",
  "FCI tvár": "Tvárová časť podľa FCI",
  "FCI uši": "Uši podľa FCI",
  "FCI veľkosť a hmotnosť poznámka": "Veľkosť a hmotnosť podľa FCI",
  "FCI využitie": "Pôvodné využitie podľa FCI",
  "Platnosť FCI štandardu": "Dátum platnosti štandardu FCI",
  "Potreby": "Každodenné potreby",
  "Pracovná skúška": "Pracovná skúška",
  "Redakcia tip pohyb": "Praktický tip k pohybu",
  "Redakcia tip srsť": "Praktický tip k srsti",
  "Redakcia tip výcvik": "Praktický tip k výcviku",
  "Redakcia tip zdravie": "Praktický tip k zdraviu",
  "Skupina": "Kategória plemena"
});
function normalized(value) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "Áno" : "Nie";
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (typeof value.start === "string") return value.start;
    if (value.date && typeof value.date.start === "string") return value.date.start;
  }
  return "";
}
function safeFieldName(name) {
  return typeof name === "string" && name &&
    !name.split(".").some((part) => forbidden.has(part));
}
/**
 * Append a clearly labeled subsection while retaining the complete original
 * paragraph. The same merge is idempotent, a later conflicting source edit
 * blocks the profile rather than silently replacing text, and a separate
 * labeled subsection is never misidentified as the current source.
 */
function tagged(existing, label, source) {
  const heading=BREED_COMPACT_HEADINGS[label];
  if(!heading)throw Error("BREED_COMPACT_HEADING_MISSING");
  const marker=heading + ": ";
  let index=existing.indexOf("\n\n"+marker);
  if(index>=0)index+=2;
  else if(existing.startsWith(marker))index=0;
  if(index>=0) {
    const tail=existing.slice(index+marker.length);
    const next=Math.min(...Object.values(BREED_COMPACT_HEADINGS)
      .map(h=>tail.indexOf("\n\n"+h+": "))
      .filter(i=>i>=0),tail.length);
    if(tail.slice(0,next).trim()===source)return existing;
    return null;
  }
  if (source.length >= 45 && existing.includes(source)) return existing;
  return (existing ? existing + "\n\n" : "") + marker + source;
}
/**
 * Input: current exact Notion field values, not a stale cached snapshot.
 * Output is only a proposal. Every source is classified, and conflicting
 * source/target changes are reported instead of replacing canonical content.
 */
export function planBreedCompactMigration(record) {
  if (!record || typeof record !== "object" || Array.isArray(record))
    throw Error("BREED_COMPACT_RECORD_INVALID");
  const changes = {};
  const statuses = [];
  const blocked = [];
  for (const [source, target] of Object.entries(BREED_COMPACT_MERGE)) {
    if (!safeFieldName(source) || !safeFieldName(target)) throw Error("BREED_COMPACT_FIELD_INVALID");
    const value = normalized(record[source]);
    if (!value) {
      statuses.push({source,target,status:"EMPTY"});
      continue;
    }
    const before = Object.prototype.hasOwnProperty.call(changes,target)
      ? changes[target] : normalized(record[target]);
    const after = tagged(before,source,value);
    if (after === null || Array.from(after).length > 180000) {
      blocked.push({source,target,reason:after===null?"SOURCE_CHANGED_AFTER_MERGE":"TARGET_TOO_LONG"});
      statuses.push({source,target,status:"BLOCKED"});
      continue;
    }
    if (after !== before) changes[target]=after;
    statuses.push({source,target,status:after===before?"ALREADY_PRESENT":"MERGE"});
  }
  for (const source of BREED_COMPACT_OPERATIONAL) statuses.push({
    source,target:null,status:"KEEP_OPERATIONAL",
    hasValue:Boolean(normalized(record[source]))
  });
  for (const source of BREED_COMPACT_RETIRE_AFTER_AUDIT) {
    const value=normalized(record[source]);
    statuses.push({source,target:null,status:value?"REQUIRES_ARCHIVE":"EMPTY_ARCHIVE"});
  }
  return {changes,statuses,blocked,ready:blocked.length===0};
}
export function assertBreedCompactContract() {
  const all=[...BREED_COMPACT_VISIBLE,...BREED_COMPACT_HIDDEN];
  const classified=[
    ...Object.keys(BREED_COMPACT_MERGE),
    ...BREED_COMPACT_OPERATIONAL,
    ...BREED_COMPACT_RETIRE_AFTER_AUDIT
  ];
  const targets=Object.values(BREED_COMPACT_MERGE);
  if (BREED_COMPACT_VISIBLE.length!==60 || BREED_COMPACT_HIDDEN.length!==49 ||
      new Set(all).size!==109 || classified.length!==49 ||
      new Set(classified).size!==49 ||
      classified.some(v=>!BREED_COMPACT_HIDDEN.includes(v)) ||
      targets.some(v=>!BREED_COMPACT_VISIBLE.includes(v)) ||
      Object.keys(BREED_COMPACT_HEADINGS).length!==23 ||
      Object.keys(BREED_COMPACT_MERGE).some(v=>!BREED_COMPACT_HEADINGS[v]) ||
      new Set(Object.values(BREED_COMPACT_HEADINGS)).size!==23) {
    throw Error("BREED_COMPACT_SCHEMA_INCOMPLETE");
  }
}
assertBreedCompactContract();
