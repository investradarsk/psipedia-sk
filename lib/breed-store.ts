import { env } from "cloudflare:workers";
import { breeds as seedBreeds, type Breed } from "@/lib/content";

export type BreedStatus = "draft" | "published";
export type ManagedBreed = Breed & { id: number; status: BreedStatus; imageKey: string | null; createdAt: string; updatedAt: string; publishedAt: string | null };
export type ManagedBreedInput = Partial<Omit<Breed, "goodFor" | "consider">> & { status?: string; goodFor?: string[]; consider?: string[]; imageKey?: string | null };
type Row = { id:number;slug:string;name:string;status:string;image_url:string;image_key:string|null;fci_group:number;fci_section:string;origin:string;group_name:string;size:string;weight:string;lifespan:string;coat:string;energy:number;trainability:number;family:number;intro:string;character:string;needs:string;good_for_json:string;consider_json:string;accent:string;created_at:string;updated_at:string;published_at:string|null };
type RuntimeBindings = { DB?: D1Database };
let ready: Promise<void> | null = null;
function db() { const value = (env as unknown as RuntimeBindings).DB; return value && typeof value.prepare === "function" ? value : null; }
function requireDb() { const value = db(); if (!value) throw new Error("Databáza plemien nie je pripojená."); return value; }
function arrays(value: string) { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.map(String) : []; } catch { return []; } }
async function ensure(database: D1Database) {
  if (ready) return ready;
  ready = (async () => {
    await database.prepare(`CREATE TABLE IF NOT EXISTS managed_breeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft', image_url TEXT NOT NULL DEFAULT '', image_key TEXT,
      fci_group INTEGER NOT NULL, fci_section TEXT NOT NULL, origin TEXT NOT NULL, group_name TEXT NOT NULL,
      size TEXT NOT NULL, weight TEXT NOT NULL, lifespan TEXT NOT NULL, coat TEXT NOT NULL,
      energy INTEGER NOT NULL DEFAULT 3, trainability INTEGER NOT NULL DEFAULT 3, family INTEGER NOT NULL DEFAULT 3,
      intro TEXT NOT NULL, character TEXT NOT NULL, needs TEXT NOT NULL,
      good_for_json TEXT NOT NULL DEFAULT '[]', consider_json TEXT NOT NULL DEFAULT '[]', accent TEXT NOT NULL DEFAULT 'forest',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, published_at TEXT, created_by TEXT NOT NULL, updated_by TEXT NOT NULL
    )`).run();
    await database.prepare("CREATE INDEX IF NOT EXISTS managed_breeds_public_idx ON managed_breeds (status,fci_group,name)").run();
    const now = new Date().toISOString();
    await database.batch(seedBreeds.map((breed) => database.prepare(`INSERT OR IGNORE INTO managed_breeds
      (slug,name,status,image_url,image_key,fci_group,fci_section,origin,group_name,size,weight,lifespan,coat,energy,trainability,family,intro,character,needs,good_for_json,consider_json,accent,created_at,updated_at,published_at,created_by,updated_by)
      VALUES (?,?,'published',?,NULL,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(breed.slug,breed.name,breed.image,breed.fciGroup,breed.fciSection,breed.origin,breed.group,breed.size,breed.weight,breed.lifespan,breed.coat,breed.energy,breed.trainability,breed.family,breed.intro,breed.character,breed.needs,JSON.stringify(breed.goodFor),JSON.stringify(breed.consider),breed.accent,now,now,now,"system@psipedia.sk","system@psipedia.sk")));
  })().catch((error) => { ready = null; throw error; });
  return ready;
}
function fromRow(row: Row): ManagedBreed { return { id:row.id,slug:row.slug,name:row.name,status:row.status === "published" ? "published" : "draft",image:row.image_url,imageKey:row.image_key,fciGroup:row.fci_group,fciSection:row.fci_section,origin:row.origin,group:row.group_name,size:row.size,weight:row.weight,lifespan:row.lifespan,coat:row.coat,energy:row.energy,trainability:row.trainability,family:row.family,intro:row.intro,character:row.character,needs:row.needs,goodFor:arrays(row.good_for_json),consider:arrays(row.consider_json),accent:row.accent as Breed["accent"],createdAt:row.created_at,updatedAt:row.updated_at,publishedAt:row.published_at }; }
const select = "SELECT id,slug,name,status,image_url,image_key,fci_group,fci_section,origin,group_name,size,weight,lifespan,coat,energy,trainability,family,intro,character,needs,good_for_json,consider_json,accent,created_at,updated_at,published_at FROM managed_breeds";
export async function listManagedBreeds() { const database=requireDb(); await ensure(database); const result=await database.prepare(`${select} ORDER BY fci_group,name`).all<Row>(); return result.results.map(fromRow); }
export async function listPublishedBreeds() { const database=db(); if (!database) return seedBreeds; await ensure(database); const result=await database.prepare(`${select} WHERE status='published' ORDER BY fci_group,name`).all<Row>(); return result.results.map(fromRow); }
export async function getManagedBreed(id:number) { const database=requireDb(); await ensure(database); const row=await database.prepare(`${select} WHERE id=?`).bind(id).first<Row>(); return row ? fromRow(row) : null; }
export async function getPublishedBreed(slug:string) { const database=db(); if (!database) return seedBreeds.find((breed)=>breed.slug===slug) ?? null; await ensure(database); const row=await database.prepare(`${select} WHERE slug=? AND status='published'`).bind(slug).first<Row>(); return row ? fromRow(row) : null; }
function clean(input: ManagedBreedInput) {
  const text=(value:unknown,max=1000)=>String(value??"").trim().slice(0,max); const score=(value:unknown)=>Math.min(5,Math.max(1,Number(value)||3));
  const slug=text(input.slug,90).toLowerCase().replace(/[^a-z0-9-]/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,""); const name=text(input.name,120);
  if (!slug || !name) throw new Error("Názov a adresa plemena sú povinné.");
  return { slug,name,status:input.status==="published"?"published":"draft",image:text(input.image,500),imageKey:input.imageKey?text(input.imageKey,500):null,fciGroup:Math.min(10,Math.max(1,Number(input.fciGroup)||1)),fciSection:text(input.fciSection,160),origin:text(input.origin,160),group:text(input.group,160),size:text(input.size,160),weight:text(input.weight,100),lifespan:text(input.lifespan,100),coat:text(input.coat,200),energy:score(input.energy),trainability:score(input.trainability),family:score(input.family),intro:text(input.intro,800),character:text(input.character,2000),needs:text(input.needs,2000),goodFor:Array.isArray(input.goodFor)?input.goodFor.map(String).map(v=>v.trim()).filter(Boolean).slice(0,20):[],consider:Array.isArray(input.consider)?input.consider.map(String).map(v=>v.trim()).filter(Boolean).slice(0,20):[],accent:["forest","coral","gold","blue"].includes(String(input.accent))?input.accent as Breed["accent"]:"forest" };
}
function values(value:ReturnType<typeof clean>) { return [value.slug,value.name,value.status,value.image,value.imageKey,value.fciGroup,value.fciSection,value.origin,value.group,value.size,value.weight,value.lifespan,value.coat,value.energy,value.trainability,value.family,value.intro,value.character,value.needs,JSON.stringify(value.goodFor),JSON.stringify(value.consider),value.accent]; }
export async function createManagedBreed(input:ManagedBreedInput,user:string) { const database=requireDb(); await ensure(database); const value=clean(input); const now=new Date().toISOString(); const result=await database.prepare(`INSERT INTO managed_breeds (slug,name,status,image_url,image_key,fci_group,fci_section,origin,group_name,size,weight,lifespan,coat,energy,trainability,family,intro,character,needs,good_for_json,consider_json,accent,created_at,updated_at,published_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...values(value),now,now,value.status==="published"?now:null,user,user).run(); return getManagedBreed(Number(result.meta.last_row_id)); }
export async function updateManagedBreed(id:number,input:ManagedBreedInput,user:string) { const database=requireDb(); await ensure(database); const value=clean(input); const now=new Date().toISOString(); await database.prepare(`UPDATE managed_breeds SET slug=?,name=?,status=?,image_url=?,image_key=?,fci_group=?,fci_section=?,origin=?,group_name=?,size=?,weight=?,lifespan=?,coat=?,energy=?,trainability=?,family=?,intro=?,character=?,needs=?,good_for_json=?,consider_json=?,accent=?,updated_at=?,published_at=CASE WHEN ?='published' THEN COALESCE(published_at,?) ELSE published_at END,updated_by=? WHERE id=?`).bind(...values(value),now,value.status,now,user,id).run(); return getManagedBreed(id); }
export async function deleteManagedBreed(id:number) { const database=requireDb(); await ensure(database); await database.prepare("DELETE FROM managed_breeds WHERE id=?").bind(id).run(); }
