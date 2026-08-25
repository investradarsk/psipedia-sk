import { env } from "cloudflare:workers";
import { breeds as seedBreeds, type Breed, type BreedImage, type BreedSource } from "@/lib/content";
import { cleanEditableSeo, type EditableSeo } from "@/lib/content-seo";

export type BreedStatus = "draft" | "published";
export type ManagedBreed = Breed & { id: number; status: BreedStatus; imageKey: string | null; createdAt: string; updatedAt: string; publishedAt: string | null };
export type ManagedBreedSummary = Pick<ManagedBreed, "id" | "slug" | "name" | "status" | "image" | "fciGroup" | "origin" | "group" | "accent">;
export type ManagedBreedInput = Partial<Breed> & { status?: string; imageKey?: string | null };
type Row = {
  id:number;slug:string;name:string;status:string;image_url:string;image_key:string|null;gallery_json:string;
  fci_group:number;fci_section:string;origin:string;group_name:string;size:string;weight:string;height:string;lifespan:string;coat:string;
  energy:number;trainability:number;family:number;children:number;other_dogs:number;apartment:number;grooming:number;shedding:number;prey_drive:number;
  intro:string;character:string;needs:string;history:string;exercise:string;training:string;health:string;health_risks_json:string;
  good_for_json:string;consider_json:string;sources_json:string;accent:string;created_at:string;updated_at:string;published_at:string|null;
  seo_json:string;
};
type SummaryRow = { id:number;slug:string;name:string;status:string;image_url:string;fci_group:number;origin:string;group_name:string;accent:string };
type RuntimeBindings = { DB?: D1Database };

function db() { const value = (env as unknown as RuntimeBindings).DB; return value && typeof value.prepare === "function" ? value : null; }
function requireDb() { const value = db(); if (!value) throw new Error("Databáza plemien nie je pripojená."); return value; }
function parseArray<T>(value:string, guard:(item:unknown)=>item is T):T[] { try { const parsed:unknown=JSON.parse(value); return Array.isArray(parsed)?parsed.filter(guard):[]; } catch { return []; } }
function stringArray(value:string) { return parseArray(value,(item):item is string=>typeof item==="string"); }
function isBreedImage(value:unknown):value is BreedImage { return Boolean(value&&typeof value==="object"&&typeof (value as BreedImage).imageUrl==="string"); }
function isBreedSource(value:unknown):value is BreedSource { return Boolean(value&&typeof value==="object"&&typeof (value as BreedSource).label==="string"&&typeof (value as BreedSource).url==="string"); }

async function ensure(database:D1Database) {
  void database;
  // Schema and seed data are installed by deployment migrations.
}

function fromRow(row:Row):ManagedBreed { return {
  id:row.id,slug:row.slug,name:row.name,status:row.status==="published"?"published":"draft",image:row.image_url,imageKey:row.image_key,
  gallery:parseArray(row.gallery_json,isBreedImage),fciGroup:row.fci_group,fciSection:row.fci_section,origin:row.origin,group:row.group_name,
  size:row.size,weight:row.weight,height:row.height,lifespan:row.lifespan,coat:row.coat,energy:row.energy,trainability:row.trainability,
  family:row.family,children:row.children,otherDogs:row.other_dogs,apartment:row.apartment,grooming:row.grooming,shedding:row.shedding,
  preyDrive:row.prey_drive,intro:row.intro,character:row.character,needs:row.needs,history:row.history,exercise:row.exercise,
  training:row.training,health:row.health,healthRisks:stringArray(row.health_risks_json),goodFor:stringArray(row.good_for_json),
  consider:stringArray(row.consider_json),sources:parseArray(row.sources_json,isBreedSource),accent:row.accent as Breed["accent"],
  createdAt:row.created_at,updatedAt:row.updated_at,publishedAt:row.published_at,
  seo:parseSeo(row.seo_json),
}; }

function parseSeo(value:string):EditableSeo { try { return cleanEditableSeo(JSON.parse(value) as EditableSeo); } catch { return {}; } }

function fromSummaryRow(row:SummaryRow):ManagedBreedSummary { return {
  id:row.id,slug:row.slug,name:row.name,status:row.status==="published"?"published":"draft",image:row.image_url,
  fciGroup:row.fci_group,origin:row.origin,group:row.group_name,accent:row.accent as Breed["accent"],
}; }

const select=`SELECT id,slug,name,status,image_url,image_key,gallery_json,fci_group,fci_section,origin,group_name,size,weight,height,
lifespan,coat,energy,trainability,family,children,other_dogs,apartment,grooming,shedding,prey_drive,intro,character,needs,
history,exercise,training,health,health_risks_json,good_for_json,consider_json,sources_json,accent,created_at,updated_at,published_at,seo_json FROM managed_breeds`;
export async function listManagedBreedSummaries(limit=100){const database=requireDb();await ensure(database);const safeLimit=Math.max(1,Math.min(200,Math.trunc(limit)));const result=await database.prepare("SELECT id,slug,name,status,image_url,fci_group,origin,group_name,accent FROM managed_breeds ORDER BY fci_group,name LIMIT ?").bind(safeLimit).all<SummaryRow>();return result.results.map(fromSummaryRow);}
export async function listPublishedBreeds(){const database=db();if(!database)return seedBreeds;const result=await database.prepare(`${select} WHERE status='published' ORDER BY fci_group,name`).all<Row>();return result.results.map(fromRow);}
export async function listFeaturedBreeds(limit=3){const safeLimit=Math.max(1,Math.min(12,Math.trunc(limit)));const database=db();if(!database)return seedBreeds.slice(0,safeLimit);const result=await database.prepare(`${select} WHERE status='published' ORDER BY fci_group,name LIMIT ?`).bind(safeLimit).all<Row>();return result.results.map(fromRow);}
export async function getManagedBreed(id:number){const database=requireDb();await ensure(database);const row=await database.prepare(`${select} WHERE id=?`).bind(id).first<Row>();return row?fromRow(row):null;}
export async function getPublishedBreed(slug:string){const database=db();if(!database)return seedBreeds.find((breed)=>breed.slug===slug)??null;const row=await database.prepare(`${select} WHERE slug=? AND status='published'`).bind(slug).first<Row>();return row?fromRow(row):null;}

function clean(input:ManagedBreedInput){
  const text=(value:unknown,max=1000)=>String(value??"").trim().slice(0,max);const score=(value:unknown)=>Math.min(5,Math.max(1,Number(value)||3));
  const strings=(value:unknown)=>Array.isArray(value)?value.map((item)=>text(item,240)).filter(Boolean).slice(0,30):[];
  const slug=text(input.slug,90).toLowerCase().replace(/[^a-z0-9-]/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"");const name=text(input.name,120);
  if(!slug||!name)throw new Error("Názov a adresa plemena sú povinné.");
  const children=score(input.children??input.family);
  const gallery=Array.isArray(input.gallery)?input.gallery.slice(0,30).map((item)=>({imageUrl:text(item.imageUrl,700),imageKey:item.imageKey?text(item.imageKey,700):null,alt:text(item.alt,240),caption:text(item.caption,500),credit:text(item.credit,300)})).filter((item)=>item.imageUrl):[];
  const sources=Array.isArray(input.sources)?input.sources.slice(0,30).map((item)=>({label:text(item.label,300),url:text(item.url,700)})).filter((item)=>item.label&&/^https?:\/\//i.test(item.url)):[];
  return {slug,name,status:input.status==="published"?"published":"draft",image:text(input.image,700),imageKey:input.imageKey?text(input.imageKey,700):null,gallery,
    fciGroup:Math.min(10,Math.max(1,Number(input.fciGroup)||1)),fciSection:text(input.fciSection,160),origin:text(input.origin,160),group:text(input.group,160),
    size:text(input.size,160),weight:text(input.weight,100),height:text(input.height,100),lifespan:text(input.lifespan,100),coat:text(input.coat,200),
    energy:score(input.energy),trainability:score(input.trainability),family:children,children,otherDogs:score(input.otherDogs),apartment:score(input.apartment),
    grooming:score(input.grooming),shedding:score(input.shedding),preyDrive:score(input.preyDrive),intro:text(input.intro,1200),character:text(input.character,8000),
    needs:text(input.needs,8000),history:text(input.history,8000),exercise:text(input.exercise,8000),training:text(input.training,8000),health:text(input.health,8000),
    healthRisks:strings(input.healthRisks),goodFor:strings(input.goodFor),consider:strings(input.consider),sources,
    accent:["forest","coral","gold","blue"].includes(String(input.accent))?input.accent as Breed["accent"]:"forest",seo:cleanEditableSeo(input.seo)};
}
function values(value:ReturnType<typeof clean>){return [value.slug,value.name,value.status,value.image,value.imageKey,JSON.stringify(value.gallery),value.fciGroup,value.fciSection,value.origin,value.group,value.size,value.weight,value.height,value.lifespan,value.coat,value.energy,value.trainability,value.family,value.children,value.otherDogs,value.apartment,value.grooming,value.shedding,value.preyDrive,value.intro,value.character,value.needs,value.history,value.exercise,value.training,value.health,JSON.stringify(value.healthRisks),JSON.stringify(value.goodFor),JSON.stringify(value.consider),JSON.stringify(value.sources),value.accent,JSON.stringify(value.seo)];}

export async function createManagedBreed(input:ManagedBreedInput,user:string){const database=requireDb();await ensure(database);const value=clean(input);const now=new Date().toISOString();const placeholders=Array.from({length:42},()=>"?").join(",");const result=await database.prepare(`INSERT INTO managed_breeds (slug,name,status,image_url,image_key,gallery_json,fci_group,fci_section,origin,group_name,size,weight,height,lifespan,coat,energy,trainability,family,children,other_dogs,apartment,grooming,shedding,prey_drive,intro,character,needs,history,exercise,training,health,health_risks_json,good_for_json,consider_json,sources_json,accent,seo_json,created_at,updated_at,published_at,created_by,updated_by) VALUES (${placeholders})`).bind(...values(value),now,now,value.status==="published"?now:null,user,user).run();return getManagedBreed(Number(result.meta.last_row_id));}
export async function updateManagedBreed(id:number,input:ManagedBreedInput,user:string){const database=requireDb();await ensure(database);const value=clean(input);const now=new Date().toISOString();await database.prepare(`UPDATE managed_breeds SET slug=?,name=?,status=?,image_url=?,image_key=?,gallery_json=?,fci_group=?,fci_section=?,origin=?,group_name=?,size=?,weight=?,height=?,lifespan=?,coat=?,energy=?,trainability=?,family=?,children=?,other_dogs=?,apartment=?,grooming=?,shedding=?,prey_drive=?,intro=?,character=?,needs=?,history=?,exercise=?,training=?,health=?,health_risks_json=?,good_for_json=?,consider_json=?,sources_json=?,accent=?,seo_json=?,updated_at=?,published_at=CASE WHEN ?='published' THEN COALESCE(published_at,?) ELSE published_at END,updated_by=? WHERE id=?`).bind(...values(value),now,value.status,now,user,id).run();return getManagedBreed(id);}
export async function deleteManagedBreed(id:number){const database=requireDb();await ensure(database);await database.prepare("DELETE FROM managed_breeds WHERE id=?").bind(id).run();}
