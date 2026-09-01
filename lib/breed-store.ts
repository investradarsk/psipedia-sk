import { env } from "cloudflare:workers";
import { breeds as seedBreeds, type Breed, type BreedImage, type BreedSource } from "@/lib/content";
import { cleanEditableSeo, type EditableSeo } from "@/lib/content-seo";
import { cleanFciStandard, normalizeBreedSearchText, type FciStandard } from "@/lib/breed-fci";

export type BreedStatus = "draft" | "published";
export type BreedEditorial = {
  overview?: string;
  coatCare?: string;
  familyLife?: string;
  otherDogsLife?: string;
  curiosities?: string;
  commonOwnerMistakes?: string;
  exerciseTip?: string;
  trainingTip?: string;
  healthTip?: string;
  coatTip?: string;
  heroTraits?: BreedHeroTrait[];
};
export type BreedHeroTrait = { label: string; rating: number };
export type BreedSport = { key: string; label: string; rating: number; note?: string };
export type ManagedBreed = Breed & {
  id: number; status: BreedStatus; imageKey: string | null; createdAt: string; updatedAt: string; publishedAt: string | null;
  fciNumber: number | null; fciSectionNumber: string; officialFciName: string; validStandardDate: string | null;
  workingTrial: string; importKey: string | null; fciStandard: FciStandard; searchText: string; editorialComplete: boolean;
  editorial: BreedEditorial; sports: BreedSport[]; relatedBreedIds: number[]; relatedArticleIds: number[]; directoryProfileIds: number[];
};
export type ManagedBreedSummary = Pick<ManagedBreed, "id" | "slug" | "name" | "status" | "image" | "fciGroup" | "origin" | "group" | "accent" | "fciNumber" | "officialFciName">;
export type ManagedBreedIndexItem = Pick<ManagedBreed, "id" | "slug" | "name" | "status" | "image" | "fciGroup" | "fciSection" | "fciSectionNumber" | "origin" | "group" | "accent" | "height" | "weight" | "intro" | "energy" | "trainability" | "family" | "officialFciName" | "searchText" | "editorialComplete" | "seo" | "updatedAt">;
export type BreedComparisonItem = Pick<ManagedBreed,"slug"|"name"|"image"|"fciGroup"|"fciSection"|"origin"|"accent"|"size"|"weight"|"lifespan"|"coat"|"energy"|"trainability"|"family"|"intro"|"goodFor"|"consider">;
export type BreedOfTheDayItem = Pick<ManagedBreed,"slug"|"name"|"image"|"fciGroup"|"fciSection"|"size"|"energy"|"trainability"|"intro">;
export type ManagedBreedInput = Partial<Breed> & Partial<Pick<ManagedBreed, "fciNumber" | "fciSectionNumber" | "officialFciName" | "validStandardDate" | "workingTrial" | "importKey" | "fciStandard" | "editorialComplete" | "editorial" | "sports" | "relatedBreedIds" | "relatedArticleIds" | "directoryProfileIds">> & { status?: string; imageKey?: string | null };
type Row = {
  id:number;slug:string;name:string;status:string;image_url:string;image_key:string|null;gallery_json:string;
  fci_number:number|null;fci_group:number;fci_section:string;fci_section_number:string;official_fci_name:string;valid_standard_date:string|null;
  working_trial:string;import_key:string|null;fci_standard_json:string;editorial_json:string;sports_json:string;related_breeds_json:string;search_text:string;editorial_complete:number;
  origin:string;group_name:string;size:string;weight:string;height:string;lifespan:string;coat:string;
  energy:number;trainability:number;family:number;children:number;other_dogs:number;apartment:number;grooming:number;shedding:number;prey_drive:number;
  intro:string;character:string;needs:string;history:string;exercise:string;training:string;health:string;health_risks_json:string;
  good_for_json:string;consider_json:string;sources_json:string;accent:string;created_at:string;updated_at:string;published_at:string|null;
  seo_json:string;
};
type SummaryRow = { id:number;slug:string;name:string;status:string;image_url:string;fci_number:number|null;fci_group:number;origin:string;group_name:string;official_fci_name:string;accent:string };
type IndexRow = SummaryRow & { fci_section:string;fci_section_number:string;height:string;weight:string;intro:string;energy:number;trainability:number;family:number;search_text:string;editorial_complete:number;seo_json:string;updated_at:string };
type ComparisonRow = {slug:string;name:string;image_url:string;fci_group:number;fci_section:string;origin:string;accent:string;size:string;weight:string;lifespan:string;coat:string;energy:number;trainability:number;family:number;intro:string;good_for_json:string;consider_json:string};
type BreedOfTheDayRow = {slug:string;name:string;image_url:string;fci_group:number;fci_section:string;size:string;energy:number;trainability:number;intro:string};
type RelationIdRow = { id:number };
export type BreedEditorOptions = {
  breeds:Array<{id:number;name:string;fciNumber:number|null}>;
  articles:Array<{id:number;title:string;status:string}>;
  directoryProfiles:Array<{id:number;name:string;category:string;city:string;region:string}>;
};
export type BreedDetailRelations = {
  articles:Array<{id:number;slug:string;title:string;excerpt:string;portalSection:string;image:string|null;accent:string}>;
  breedingStations:Array<{id:number;slug:string;name:string;excerpt:string;city:string;region:string;image:string|null}>;
  breedClubs:Array<{id:number;slug:string;name:string;excerpt:string;city:string;region:string;image:string|null}>;
  similarBreeds:Array<{id:number;slug:string;name:string;image:string;fciGroup:number;fciSection:string}>;
};
type RuntimeBindings = { DB?: D1Database };

function db() { const value = (env as unknown as RuntimeBindings).DB; return value && typeof value.prepare === "function" ? value : null; }
function requireDb() { const value = db(); if (!value) throw new Error("Databáza plemien nie je pripojená."); return value; }
function parseArray<T>(value:string, guard:(item:unknown)=>item is T):T[] { try { const parsed:unknown=JSON.parse(value); return Array.isArray(parsed)?parsed.filter(guard):[]; } catch { return []; } }
function stringArray(value:string) { return parseArray(value,(item):item is string=>typeof item==="string"); }
function isBreedImage(value:unknown):value is BreedImage { return Boolean(value&&typeof value==="object"&&typeof (value as BreedImage).imageUrl==="string"); }
function isBreedSource(value:unknown):value is BreedSource { return Boolean(value&&typeof value==="object"&&typeof (value as BreedSource).label==="string"&&typeof (value as BreedSource).url==="string"); }
function isBreedSport(value:unknown):value is BreedSport { const item=value as BreedSport;return Boolean(item&&typeof item==="object"&&typeof item.key==="string"&&typeof item.label==="string"&&Number.isFinite(item.rating)); }
function isBreedHeroTrait(value:unknown):value is BreedHeroTrait { const item=value as BreedHeroTrait;return Boolean(item&&typeof item==="object"&&typeof item.label==="string"&&item.label.trim()&&Number.isFinite(item.rating)&&item.rating>=1&&item.rating<=5); }
function parseObject<T extends object>(value:string):T { try { const parsed:unknown=JSON.parse(value); return parsed && typeof parsed==="object" && !Array.isArray(parsed) ? parsed as T : {} as T; } catch { return {} as T; } }

async function ensure(database:D1Database) {
  void database;
  // Schema and seed data are installed by deployment migrations.
}

function fromRow(row:Row,relations:{articles?:number[];directory?:number[]}={}):ManagedBreed { const editorial=parseObject<BreedEditorial>(row.editorial_json);editorial.heroTraits=Array.isArray(editorial.heroTraits)?editorial.heroTraits.filter(isBreedHeroTrait).slice(0,3):[];return {
  id:row.id,slug:row.slug,name:row.name,status:row.status==="published"?"published":"draft",image:row.image_url,imageKey:row.image_key,
  gallery:parseArray(row.gallery_json,isBreedImage),fciNumber:row.fci_number,fciGroup:row.fci_group,fciSection:row.fci_section,
  fciSectionNumber:row.fci_section_number,officialFciName:row.official_fci_name,validStandardDate:row.valid_standard_date,
  workingTrial:row.working_trial,importKey:row.import_key,fciStandard:parseObject<FciStandard>(row.fci_standard_json),editorial,
  sports:parseArray(row.sports_json,isBreedSport),relatedBreedIds:parseArray(row.related_breeds_json,(item):item is number=>Number.isSafeInteger(item)&&Number(item)>0),relatedArticleIds:relations.articles??[],directoryProfileIds:relations.directory??[],searchText:row.search_text,
  editorialComplete:row.editorial_complete===1,origin:row.origin,group:row.group_name,
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
  fciNumber:row.fci_number,fciGroup:row.fci_group,origin:row.origin,group:row.group_name,officialFciName:row.official_fci_name,accent:row.accent as Breed["accent"],
}; }

function fromIndexRow(row:IndexRow):ManagedBreedIndexItem { return {
  ...fromSummaryRow(row),fciSection:row.fci_section,fciSectionNumber:row.fci_section_number,height:row.height,weight:row.weight,intro:row.intro,energy:row.energy,trainability:row.trainability,family:row.family,
  searchText:row.search_text,editorialComplete:row.editorial_complete===1,seo:parseSeo(row.seo_json),updatedAt:row.updated_at,
}; }

const select=`SELECT id,slug,name,status,image_url,image_key,gallery_json,fci_number,fci_group,fci_section,fci_section_number,official_fci_name,
valid_standard_date,working_trial,import_key,fci_standard_json,editorial_json,sports_json,related_breeds_json,search_text,editorial_complete,origin,group_name,size,weight,height,
lifespan,coat,energy,trainability,family,children,other_dogs,apartment,grooming,shedding,prey_drive,intro,character,needs,
history,exercise,training,health,health_risks_json,good_for_json,consider_json,sources_json,accent,created_at,updated_at,published_at,seo_json FROM managed_breeds`;
export async function listManagedBreedSummaries(limit=500){const database=requireDb();await ensure(database);const safeLimit=Math.max(1,Math.min(500,Math.trunc(limit)));const result=await database.prepare("SELECT id,slug,name,status,image_url,fci_number,fci_group,origin,group_name,official_fci_name,accent FROM managed_breeds ORDER BY fci_group,name LIMIT ?").bind(safeLimit).all<SummaryRow>();return result.results.map(fromSummaryRow);}
export async function listPublishedBreedIndex(){const database=db();if(!database)return seedBreeds.map((breed,index)=>({id:-(index+1),status:"published" as const,officialFciName:"",fciSectionNumber:"",searchText:normalizeBreedSearchText(`${breed.name} ${breed.group} ${breed.fciSection} ${breed.intro}`),editorialComplete:true,seo:breed.seo??{},updatedAt:"2026-08-17",...breed}));const result=await database.prepare("SELECT id,slug,name,status,image_url,fci_number,fci_group,fci_section,fci_section_number,origin,group_name,official_fci_name,accent,height,weight,intro,energy,trainability,family,search_text,editorial_complete,seo_json,updated_at FROM managed_breeds WHERE status='published' ORDER BY fci_group,name").all<IndexRow>();return result.results.map(fromIndexRow);}
export async function listPublishedCanonicalBreedIndex(){const database=db();if(!database)return listPublishedBreedIndex();const result=await database.prepare("SELECT id,slug,name,status,image_url,fci_number,fci_group,fci_section,fci_section_number,origin,group_name,official_fci_name,accent,height,weight,intro,energy,trainability,family,search_text,editorial_complete,seo_json,updated_at FROM managed_breeds WHERE status='published' AND fci_number IS NOT NULL AND import_key IS NOT NULL AND TRIM(import_key)<>'' ORDER BY fci_group,name").all<IndexRow>();return result.results.map(fromIndexRow);}
export async function listPublishedBreedsForComparison():Promise<BreedComparisonItem[]>{const database=db();if(!database)return seedBreeds;const result=await database.prepare("SELECT slug,name,image_url,fci_group,fci_section,origin,accent,size,weight,lifespan,coat,energy,trainability,family,intro,good_for_json,consider_json FROM managed_breeds WHERE status='published' AND editorial_complete=1 ORDER BY fci_group,name").all<ComparisonRow>();return result.results.map((row:ComparisonRow)=>({slug:row.slug,name:row.name,image:row.image_url,fciGroup:row.fci_group,fciSection:row.fci_section,origin:row.origin,accent:row.accent as Breed['accent'],size:row.size,weight:row.weight,lifespan:row.lifespan,coat:row.coat,energy:row.energy,trainability:row.trainability,family:row.family,intro:row.intro,goodFor:stringArray(row.good_for_json),consider:stringArray(row.consider_json)}));}
export async function getBreedOfTheDay(dayOfYear:number):Promise<BreedOfTheDayItem|null>{const safeDay=Math.max(1,Math.trunc(dayOfYear)||1);const database=db();if(!database){const candidates=seedBreeds;if(!candidates.length)return null;const breed=candidates[(safeDay-1)%candidates.length];return {slug:breed.slug,name:breed.name,image:breed.image,fciGroup:breed.fciGroup,fciSection:breed.fciSection,size:breed.size,energy:breed.energy,trainability:breed.trainability,intro:breed.intro};}const row=await database.prepare(`WITH published AS (SELECT slug,name,image_url,fci_group,fci_section,size,energy,trainability,intro,ROW_NUMBER() OVER (ORDER BY fci_group,name) AS row_number,COUNT(*) OVER () AS total FROM managed_breeds WHERE status='published' AND editorial_complete=1) SELECT slug,name,image_url,fci_group,fci_section,size,energy,trainability,intro FROM published WHERE row_number=((?-1)%total)+1 LIMIT 1`).bind(safeDay).first<BreedOfTheDayRow>();return row?{slug:row.slug,name:row.name,image:row.image_url,fciGroup:row.fci_group,fciSection:row.fci_section,size:row.size,energy:row.energy,trainability:row.trainability,intro:row.intro}:null;}
export async function listPublishedBreeds(){const database=db();if(!database)return seedBreeds;const result=await database.prepare(`${select} WHERE status='published' ORDER BY fci_group,name`).all<Row>();return result.results.map(fromRow);}
export async function listFeaturedBreeds(limit=3){const safeLimit=Math.max(1,Math.min(12,Math.trunc(limit)));const database=db();if(!database)return seedBreeds.slice(0,safeLimit);const result=await database.prepare(`${select} WHERE status='published' ORDER BY fci_group,name LIMIT ?`).bind(safeLimit).all<Row>();return result.results.map(fromRow);}
export async function getManagedBreed(id:number){const database=requireDb();await ensure(database);const [breedResult,articleResult,directoryResult]=await database.batch([database.prepare(`${select} WHERE id=?`).bind(id),database.prepare("SELECT article_id AS id FROM breed_article_relations WHERE breed_id=? ORDER BY article_id").bind(id),database.prepare("SELECT profile_id AS id FROM breed_directory_relations WHERE breed_id=? ORDER BY profile_id").bind(id)]);const row=(breedResult.results?.[0]??null) as unknown as Row|null;return row?fromRow(row,{articles:(articleResult.results as RelationIdRow[]).map((item)=>item.id),directory:(directoryResult.results as RelationIdRow[]).map((item)=>item.id)}):null;}
export async function getPublishedBreed(slug:string){const database=db();if(!database)return seedBreeds.find((breed)=>breed.slug===slug)??null;const row=await database.prepare(`${select} WHERE slug=? AND status='published'`).bind(slug).first<Row>();return row?fromRow(row):null;}

export async function getBreedEditorOptions():Promise<BreedEditorOptions>{const database=requireDb();const [breedsResult,articlesResult,directoryResult]=await database.batch([
  database.prepare("SELECT id,name,fci_number FROM managed_breeds ORDER BY fci_group,name LIMIT 500"),
  database.prepare("SELECT id,title,status FROM managed_articles ORDER BY updated_at DESC,id DESC LIMIT 500"),
  database.prepare("SELECT id,name,category,city,region FROM directory_profiles WHERE category IN ('chovatelske-stanice','chovatelske-kluby') ORDER BY category,name LIMIT 500"),
]);return {breeds:breedsResult.results as BreedEditorOptions["breeds"],articles:articlesResult.results as BreedEditorOptions["articles"],directoryProfiles:directoryResult.results as BreedEditorOptions["directoryProfiles"]};}

export async function getBreedDetailRelations(breed:Pick<ManagedBreed,"id"|"fciGroup"|"fciSectionNumber"|"relatedBreedIds">):Promise<BreedDetailRelations>{
  const database=db();if(!database)return {articles:[],breedingStations:[],breedClubs:[],similarBreeds:[]};
  const articleQuery=database.prepare(`SELECT a.id,a.slug,a.title,a.excerpt,a.portal_section,a.image_url,a.accent FROM breed_article_relations r JOIN managed_articles a ON a.id=r.article_id WHERE r.breed_id=? AND (a.status='published' OR (a.status='scheduled' AND a.published_at<=?)) ORDER BY a.published_at DESC,a.id DESC LIMIT 5`).bind(breed.id,new Date().toISOString());
  const stationsQuery=database.prepare(`SELECT d.id,d.slug,d.name,d.category,d.excerpt,d.city,d.region,d.image_url FROM breed_directory_relations r JOIN directory_profiles d ON d.id=r.profile_id WHERE r.breed_id=? AND d.status='published' AND d.category='chovatelske-stanice' ORDER BY d.featured DESC,d.name ASC LIMIT 4`).bind(breed.id);
  const clubsQuery=database.prepare(`SELECT d.id,d.slug,d.name,d.category,d.excerpt,d.city,d.region,d.image_url FROM breed_directory_relations r JOIN directory_profiles d ON d.id=r.profile_id WHERE r.breed_id=? AND d.status='published' AND d.category='chovatelske-kluby' ORDER BY d.featured DESC,d.name ASC LIMIT 3`).bind(breed.id);
  const similarQuery=breed.relatedBreedIds.length?database.prepare(`SELECT b.id,b.slug,b.name,b.image_url,b.fci_group,b.fci_section FROM json_each(?) chosen JOIN managed_breeds b ON b.id=CAST(chosen.value AS INTEGER) WHERE b.status='published' AND b.id<>? ORDER BY chosen.key LIMIT 4`).bind(JSON.stringify(breed.relatedBreedIds),breed.id):database.prepare(`SELECT id,slug,name,image_url,fci_group,fci_section FROM managed_breeds WHERE status='published' AND id<>? AND fci_group=? AND (?='' OR fci_section_number=?) ORDER BY name LIMIT 4`).bind(breed.id,breed.fciGroup,breed.fciSectionNumber,breed.fciSectionNumber);
  const [articlesResult,stationsResult,clubsResult,similarResult]=await database.batch([articleQuery,stationsQuery,clubsQuery,similarQuery]);
  const articles=(articlesResult.results as Array<{id:number;slug:string;title:string;excerpt:string;portal_section:string;image_url:string|null;accent:string}>).map((row)=>({id:row.id,slug:row.slug,title:row.title,excerpt:row.excerpt,portalSection:row.portal_section,image:row.image_url,accent:row.accent}));
  const directory=[...stationsResult.results,...clubsResult.results].map((row)=>row as {id:number;slug:string;name:string;category:string;excerpt:string;city:string;region:string;image_url:string|null}).map((row)=>({id:row.id,slug:row.slug,name:row.name,category:row.category,excerpt:row.excerpt,city:row.city,region:row.region,image:row.image_url}));
  const similarBreeds=(similarResult.results as Array<{id:number;slug:string;name:string;image_url:string;fci_group:number;fci_section:string}>).map((row)=>({id:row.id,slug:row.slug,name:row.name,image:row.image_url,fciGroup:row.fci_group,fciSection:row.fci_section}));
  return {articles,breedingStations:directory.filter((item)=>item.category==='chovatelske-stanice'),breedClubs:directory.filter((item)=>item.category==='chovatelske-kluby'),similarBreeds};
}

function clean(input:ManagedBreedInput){
  const text=(value:unknown,max=1000)=>String(value??"").trim().slice(0,max);const score=(value:unknown)=>Math.min(5,Math.max(1,Number(value)||3));
  const strings=(value:unknown)=>Array.isArray(value)?value.map((item)=>text(item,240)).filter(Boolean).slice(0,30):[];
  const ids=(value:unknown)=>Array.isArray(value)?[...new Set(value.map(Number).filter((item)=>Number.isSafeInteger(item)&&item>0))].slice(0,100):[];
  const slug=text(input.slug,90).toLowerCase().replace(/[^a-z0-9-]/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"");const name=text(input.name,120);
  if(!slug||!name)throw new Error("Názov a adresa plemena sú povinné.");
  const children=score(input.children??input.family);
  const gallery=Array.isArray(input.gallery)?input.gallery.slice(0,30).map((item)=>({imageUrl:text(item.imageUrl,700),imageKey:item.imageKey?text(item.imageKey,700):null,alt:text(item.alt,240),caption:text(item.caption,500),credit:text(item.credit,300)})).filter((item)=>item.imageUrl):[];
  const sources=Array.isArray(input.sources)?input.sources.slice(0,30).map((item)=>({label:text(item.label,300),url:text(item.url,700)})).filter((item)=>item.label&&/^https?:\/\//i.test(item.url)):[];
  const officialFciName=text(input.officialFciName,200);const fciStandard=cleanFciStandard(input.fciStandard);
  const rawEditorial=input.editorial??{};const editorial:BreedEditorial={overview:text(rawEditorial.overview,8000),coatCare:text(rawEditorial.coatCare,8000),familyLife:text(rawEditorial.familyLife,8000),otherDogsLife:text(rawEditorial.otherDogsLife,8000),curiosities:text(rawEditorial.curiosities,8000),commonOwnerMistakes:text(rawEditorial.commonOwnerMistakes,8000),exerciseTip:text(rawEditorial.exerciseTip,500),trainingTip:text(rawEditorial.trainingTip,500),healthTip:text(rawEditorial.healthTip,500),coatTip:text(rawEditorial.coatTip,500),heroTraits:Array.isArray(rawEditorial.heroTraits)?rawEditorial.heroTraits.slice(0,3).map((item)=>({label:text(item.label,80),rating:Math.min(5,Math.max(1,Number(item.rating)||1))})).filter((item)=>item.label):[]};
  const sports=Array.isArray(input.sports)?input.sports.slice(0,30).map((item)=>({key:text(item.key,80),label:text(item.label,120),rating:Math.min(5,Math.max(1,Number(item.rating)||1)),note:text(item.note,500)})).filter((item)=>item.key&&item.label):[];
  const fciNumber=Number.isSafeInteger(input.fciNumber)&&Number(input.fciNumber)>0?Number(input.fciNumber):null;
  return {slug,name,status:input.status==="published"?"published":"draft",image:text(input.image,700),imageKey:input.imageKey?text(input.imageKey,700):null,gallery,
    fciNumber,fciGroup:Math.min(10,Math.max(1,Number(input.fciGroup)||1)),fciSection:text(input.fciSection,160),fciSectionNumber:text(input.fciSectionNumber,80),
    officialFciName,validStandardDate:input.validStandardDate?text(input.validStandardDate,40):null,workingTrial:text(input.workingTrial,160),
    importKey:input.importKey?text(input.importKey,120):null,fciStandard,editorial,sports,relatedBreedIds:ids(input.relatedBreedIds),relatedArticleIds:ids(input.relatedArticleIds),directoryProfileIds:ids(input.directoryProfileIds),editorialComplete:input.editorialComplete!==false,
    origin:text(input.origin,160),group:text(input.group,160),
    size:text(input.size,160),weight:text(input.weight,100),height:text(input.height,100),lifespan:text(input.lifespan,100),coat:text(input.coat,200),
    energy:score(input.energy),trainability:score(input.trainability),family:children,children,otherDogs:score(input.otherDogs),apartment:score(input.apartment),
    grooming:score(input.grooming),shedding:score(input.shedding),preyDrive:score(input.preyDrive),intro:text(input.intro,1200),character:text(input.character,8000),
    needs:text(input.needs,8000),history:text(input.history,8000),exercise:text(input.exercise,8000),training:text(input.training,8000),health:text(input.health,8000),
    healthRisks:strings(input.healthRisks),goodFor:strings(input.goodFor),consider:strings(input.consider),sources,
    accent:["forest","coral","gold","blue"].includes(String(input.accent))?input.accent as Breed["accent"]:"forest",seo:cleanEditableSeo(input.seo),
    searchText:normalizeBreedSearchText(`${name} ${officialFciName} ${text(input.origin,160)} ${text(input.group,160)} ${text(input.fciSection,160)}`)};
}
function values(value:ReturnType<typeof clean>){return [value.slug,value.name,value.status,value.image,value.imageKey,JSON.stringify(value.gallery),value.fciNumber,value.fciGroup,value.fciSection,value.fciSectionNumber,value.officialFciName,value.validStandardDate,value.workingTrial,value.importKey,JSON.stringify(value.fciStandard),JSON.stringify(value.editorial),JSON.stringify(value.sports),JSON.stringify(value.relatedBreedIds),value.searchText,value.editorialComplete?1:0,value.origin,value.group,value.size,value.weight,value.height,value.lifespan,value.coat,value.energy,value.trainability,value.family,value.children,value.otherDogs,value.apartment,value.grooming,value.shedding,value.preyDrive,value.intro,value.character,value.needs,value.history,value.exercise,value.training,value.health,JSON.stringify(value.healthRisks),JSON.stringify(value.goodFor),JSON.stringify(value.consider),JSON.stringify(value.sources),value.accent,JSON.stringify(value.seo)];}

async function syncRelations(database:D1Database,breedId:number,value:ReturnType<typeof clean>,user:string){const now=new Date().toISOString();const statements=[database.prepare("DELETE FROM breed_article_relations WHERE breed_id=?").bind(breedId),database.prepare("DELETE FROM breed_directory_relations WHERE breed_id=?").bind(breedId)];for(const articleId of value.relatedArticleIds)statements.push(database.prepare("INSERT OR IGNORE INTO breed_article_relations (breed_id,article_id,created_at,created_by) SELECT ?,id,?,? FROM managed_articles WHERE id=?").bind(breedId,now,user,articleId));for(const profileId of value.directoryProfileIds)statements.push(database.prepare("INSERT OR IGNORE INTO breed_directory_relations (breed_id,profile_id,relation_type,source,created_at,created_by) SELECT ?,id,CASE WHEN category='chovatelske-stanice' THEN 'breeding-station' ELSE 'breed-club' END,'manual',?,? FROM directory_profiles WHERE id=? AND category IN ('chovatelske-stanice','chovatelske-kluby')").bind(breedId,now,user,profileId));await database.batch(statements);}
export async function createManagedBreed(input:ManagedBreedInput,user:string){const database=requireDb();await ensure(database);const value=clean(input);const now=new Date().toISOString();const placeholders=Array.from({length:54},()=>"?").join(",");const result=await database.prepare(`INSERT INTO managed_breeds (slug,name,status,image_url,image_key,gallery_json,fci_number,fci_group,fci_section,fci_section_number,official_fci_name,valid_standard_date,working_trial,import_key,fci_standard_json,editorial_json,sports_json,related_breeds_json,search_text,editorial_complete,origin,group_name,size,weight,height,lifespan,coat,energy,trainability,family,children,other_dogs,apartment,grooming,shedding,prey_drive,intro,character,needs,history,exercise,training,health,health_risks_json,good_for_json,consider_json,sources_json,accent,seo_json,created_at,updated_at,published_at,created_by,updated_by) VALUES (${placeholders})`).bind(...values(value),now,now,value.status==="published"?now:null,user,user).run();const id=Number(result.meta.last_row_id);await syncRelations(database,id,value,user);return getManagedBreed(id);}
export async function updateManagedBreed(id:number,input:ManagedBreedInput,user:string){const database=requireDb();await ensure(database);const value=clean(input);const now=new Date().toISOString();await database.prepare(`UPDATE managed_breeds SET slug=?,name=?,status=?,image_url=?,image_key=?,gallery_json=?,fci_number=?,fci_group=?,fci_section=?,fci_section_number=?,official_fci_name=?,valid_standard_date=?,working_trial=?,import_key=?,fci_standard_json=?,editorial_json=?,sports_json=?,related_breeds_json=?,search_text=?,editorial_complete=?,origin=?,group_name=?,size=?,weight=?,height=?,lifespan=?,coat=?,energy=?,trainability=?,family=?,children=?,other_dogs=?,apartment=?,grooming=?,shedding=?,prey_drive=?,intro=?,character=?,needs=?,history=?,exercise=?,training=?,health=?,health_risks_json=?,good_for_json=?,consider_json=?,sources_json=?,accent=?,seo_json=?,updated_at=?,published_at=CASE WHEN ?='published' THEN COALESCE(published_at,?) ELSE published_at END,updated_by=? WHERE id=?`).bind(...values(value),now,value.status,now,user,id).run();await syncRelations(database,id,value,user);return getManagedBreed(id);}
export async function deleteManagedBreed(id:number){const database=requireDb();await ensure(database);await database.batch([database.prepare("DELETE FROM breed_article_relations WHERE breed_id=?").bind(id),database.prepare("DELETE FROM breed_directory_relations WHERE breed_id=?").bind(id),database.prepare("DELETE FROM managed_breeds WHERE id=?").bind(id)]);}
