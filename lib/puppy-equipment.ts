/** Stable checklist IDs: never reuse an ID for a different item. */
export type PuppyEquipmentItem = { id: string; title: string; hint: string; optional?: boolean };
export type PuppyEquipmentGroup = { id: string; title: string; items: readonly PuppyEquipmentItem[] };
export const PUPPY_EQUIPMENT_GROUPS: readonly PuppyEquipmentGroup[] = [
  { id: "domov", title: "Domov a oddych", items: [
    { id: "peliesok", title: "Pelech alebo podložka", hint: "Prateľné, pokojné miesto bez prievanu." },
    { id: "deka", title: "Deka", hint: "Na oddych; známy pach z pôvodného domova môže pomôcť." },
    { id: "bezpecnost", title: "Zabezpečený byt alebo dom", hint: "Odlož káble, lieky, jedovaté rastliny a malé predmety." },
    { id: "zabrana", title: "Detská bránka alebo ohrádka", hint: "Bezpečne oddelí nevhodné priestory.", optional: true },
  ] },
  { id: "krmenie", title: "Kŕmenie a pitie", items: [
    { id: "miska-voda", title: "Miska na vodu", hint: "Stabilná a ľahko umývateľná; voda musí byť dostupná." },
    { id: "miska-jedlo", title: "Miska na krmivo", hint: "Veľkosť prispôsob šteniatku." },
    { id: "krmivo", title: "Krmivo pre šteniatka", hint: "Na začiatok sa dohodni s chovateľom na doterajšom krmive a zmene postupne." },
    { id: "odmeny", title: "Malé tréningové odmeny", hint: "Vhodné pre vek a veľkosť; započítaj ich do dennej dávky." },
  ] },
  { id: "vencenie", title: "Venčenie a bezpečnosť", items: [
    { id: "postroj", title: "Dobre padnúci postroj alebo obojok", hint: "Pravidelne kontroluj veľkosť počas rastu." },
    { id: "vodidlo", title: "Pevné vodidlo", hint: "Ľahké, bezpečné a primerané veľkosti psa." },
    { id: "znamka", title: "Identifikačná známka", hint: "S aktuálnym telefónnym číslom." },
    { id: "vrecka", title: "Vrecká na exkrementy", hint: "Priprav zásobu k dverám aj na cesty." },
    { id: "auto", title: "Bezpečná preprava", hint: "Vhodná prepravka alebo bezpečnostný systém pri jazde autom." },
  ] },
  { id: "hygiena", title: "Hygiena", items: [
    { id: "cistic", title: "Čistič na nehody v domácnosti", hint: "Enzymatický prípravok používaj podľa návodu mimo dosahu psa." },
    { id: "uterak", title: "Uterák", hint: "Na osušenie po prechádzke." },
    { id: "kefa", title: "Kefa alebo hrebeň", hint: "Vyber podľa typu srsti." },
    { id: "podlozky", title: "Hygienické podložky", hint: "Podľa podmienok doma; nenahrádzajú pravidelné venčenie.", optional: true },
  ] },
  { id: "hra", title: "Hra a výcvik", items: [
    { id: "hracky", title: "Bezpečné hračky", hint: "Primeraná veľkosť, bez ľahko oddeliteľných častí; hru sleduj." },
    { id: "zuvanie", title: "Hračka na žuvanie", hint: "Pružná a vhodná pre šteňacie zuby; nie tvrdé kosti." },
    { id: "odmenovnik", title: "Taštička na odmeny", hint: "Pomôže pri krátkom každodennom tréningu.", optional: true },
  ] },
  { id: "zdravie", title: "Zdravie a dokumenty", items: [
    { id: "doklady", title: "Doklady a zdravotné záznamy", hint: "Zmluva, údaje o čipe, očkovací preukaz alebo pas podľa situácie." },
    { id: "veterinar", title: "Dohodnutý veterinár", hint: "Naplánuj vstupnú prehliadku a individuálnu prevenciu." },
    { id: "cip", title: "Overenie čipu a registrácie", hint: "S veterinárom over údaje a zmenu majiteľa." },
    { id: "lekarnicka", title: "Základná lekárnička", hint: "Sterilné krytie, obväz a kontakt na veterinárnu pohotovosť; lieky len podľa veterinára." },
  ] },
];
export const PUPPY_EQUIPMENT_STORAGE_KEY = "psipedia-puppy-equipment-v1";
const items = PUPPY_EQUIPMENT_GROUPS.flatMap(group => group.items);
const validIds = new Set(items.map(item => item.id));
export function parsePuppyEquipmentProgress(raw: string | null | undefined): string[] {
  try {
    const value: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((id): id is string => typeof id === "string" && validIds.has(id)))];
  } catch { return []; }
}
export function puppyEquipmentProgress(ids: readonly string[]) {
  const checked = new Set(ids);
  const essentials = items.filter(item => !item.optional);
  const done = essentials.filter(item => checked.has(item.id)).length;
  return { done, total: essentials.length, percent: Math.round(done / essentials.length * 100), allDone: items.filter(item => checked.has(item.id)).length, allTotal: items.length };
}
