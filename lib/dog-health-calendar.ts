export const DOG_HEALTH_STORAGE_KEY = "psipedia-dog-health-v1";
export const DOG_HEALTH_TYPES = {
  vaccination: "Očkovanie", deworming: "Odčervenie", parasites: "Ochrana proti parazitom",
  vet: "Návšteva veterinára", dental: "Zuby a dentálna hygiena", weight: "Hmotnosť", other: "Iné",
} as const;
export type HealthType = keyof typeof DOG_HEALTH_TYPES;
export type HealthDog = { id: string; name: string };
export type HealthEntry = { id: string; dogId: string; type: HealthType; date: string; title: string; notes: string; done: boolean; weight?: number };
export type HealthData = { dogs: HealthDog[]; entries: HealthEntry[] };
export const MAX_DOGS = 30;
export const MAX_ENTRIES = 2000;
export function emptyHealthData(): HealthData { return { dogs: [], entries: [] }; }
export function validHealthDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1900-01-01" || value > "2099-12-31") return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function localHealthDate(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}
function obj(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function id(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value); }
function clean(value: unknown, length: number) { return typeof value === "string" ? value.trim().slice(0,length) : ""; }
export function parseHealthData(raw: string | null | undefined): HealthData {
  try {
    const data = obj(JSON.parse(raw ?? "{}"));
    if (!data) return emptyHealthData();
    const dogs: HealthDog[] = [], entries: HealthEntry[] = [];
    const dogIds = new Set<string>(), entryIds = new Set<string>();
    for (const value of Array.isArray(data.dogs) ? data.dogs.slice(0,MAX_DOGS) : []) {
      const dog = obj(value); if (!dog || !id(dog.id) || dogIds.has(dog.id)) continue;
      const name = clean(dog.name,60); if (!name) continue;
      dogIds.add(dog.id); dogs.push({id:dog.id,name});
    }
    for (const value of Array.isArray(data.entries) ? data.entries.slice(0,MAX_ENTRIES) : []) {
      const e = obj(value);
      if (!e || !id(e.id) || entryIds.has(e.id) || !id(e.dogId) || !dogIds.has(e.dogId) || !validHealthDate(e.date) || typeof e.type !== "string" || !Object.hasOwn(DOG_HEALTH_TYPES,e.type)) continue;
      const type = e.type as HealthType;
      const weight = typeof e.weight === "number" && Number.isFinite(e.weight) && e.weight > 0 && e.weight <= 200 ? e.weight : undefined;
      if (type === "weight" && weight === undefined) continue;
      entryIds.add(e.id); entries.push({id:e.id,dogId:e.dogId,type,date:e.date,title:clean(e.title,100),notes:clean(e.notes,500),done:type === "weight" || e.done === true,...(type === "weight" ? {weight} : {})});
    }
    return {dogs,entries};
  } catch { return emptyHealthData(); }
}
export function healthEntryTitle(e: HealthEntry) { return e.title || DOG_HEALTH_TYPES[e.type]; }
export function healthMonthDays(month: string): (string | null)[] {
  if (!validHealthDate(month + "-01")) return [];
  const date = new Date(month + "-01T00:00:00Z");
  const offset = (date.getUTCDay()+6)%7;
  const last = new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
  return [...Array.from({length:offset},()=>null),...Array.from({length:last},(_,i)=>month+"-"+String(i+1).padStart(2,"0"))];
}
export function moveHealthMonth(month: string, delta: number) {
  if (!validHealthDate(month+"-01")) return month;
  const date = new Date(month+"-01T00:00:00Z");
  date.setUTCMonth(date.getUTCMonth()+delta);
  const next = date.toISOString().slice(0,7);
  return validHealthDate(next+"-01") ? next : month;
}
export function removeHealthDog(data: HealthData, id: string): HealthData {
  return { dogs:data.dogs.filter(d=>d.id!==id),entries:data.entries.filter(e=>e.dogId!==id) };
}
