import { requireProfileMediaProof, type VerifiedProfileMedia } from "./notion-profile-owned-media.ts";
import { helpAuthorityWriteGuard } from "./notion-profile-authority.ts";
import type { FieldReservation } from "./notion-unified-field-transfer.ts";
import { reviewOnSaveStatements } from "./admin-review-on-save.ts";
import { commitAdoptionV2AdminEdit, ADOPTION_V2_FIELDS, isAdoptionV2Field, adoptionV2Value } from "./notion-adoption-v2-contract.ts";
import { nextHelpV2Revision } from "./notion-help-v2-admin-receipts.ts";
import { partnerReviewOwnerSql } from "./admin-notion-review-lock.ts";
import { normalizeAdoptionSearchText } from "./adoption.ts";
import { env } from "cloudflare:workers";
import type { ManagedAdoptionInput } from "./adoption.ts";
import {
  readCanonicalBreedOptions,
  type CanonicalBreedOption,
  type CanonicalBreedOptionsResult,
} from "./breed-options.ts";
import {
  createManagedAdoption,
  getAdoptionById,
  isAdoptionConflict,
  prepareAdoptionWritePayload,
  type AdoptionD1Database,
  type PreparedAdoptionWrite,
} from "./adoption-store.ts";

export type AdoptionAdminBreedOption = CanonicalBreedOption;
export type AdoptionAdminBreedOptionsResult = CanonicalBreedOptionsResult;
export type AdoptionAdminOrganizationOption = { id: number; name: string; slug: string };
type RuntimeBindings = { DB?: AdoptionD1Database };
type RunResult = { meta?: { changes?: number }; changes?: number };

const MUTABLE_COLUMNS = [
  "name", "slug", "status", "sex", "birth_date", "approximate_age_months", "size", "weight", "breed_id", "breed_name",
  "breed_mix", "color", "region", "district", "city", "organization_id", "organization_name", "organization_slug", "main_image", "thumbnail_display_json", "detail_display_json",
  "gallery_json", "short_description", "description", "temperament", "activity_level", "suitable_for_children", "suitable_for_dogs",
  "suitable_for_cats", "suitable_for_other_animals", "apartment_suitable", "beginner_suitable", "needs_experienced_owner",
  "vaccination_status", "chipped", "neutered", "health_notes", "special_needs", "adoption_requirements", "external_source_url",
  "contact_email", "contact_phone", "contact_url", "search_text", "published_at", "last_verified_at", "updated_at", "updated_by",
] as const;

function requireD1Binding(database?: AdoptionD1Database) {
  const bound = (env as unknown as RuntimeBindings).DB;
  const resolved = database ?? (bound && typeof bound.prepare === "function" ? bound : null);
  if (!resolved) throw new Error("Databáza adopcií zatiaľ nie je pripojená.");
  return resolved;
}

function writeValues(input: PreparedAdoptionWrite) {
  return [
    input.name, input.slug, input.status, input.sex, input.birthDate, input.approximateAgeMonths, input.size, input.weight,
    input.breedId, input.breedName, input.breedMix ? 1 : 0, input.color, input.region, input.district, input.city,
    input.organizationId, input.organizationName, input.organizationSlug, input.mainImage,
    input.thumbnailImageDisplay ? JSON.stringify(input.thumbnailImageDisplay) : null,
    input.detailImageDisplay ? JSON.stringify(input.detailImageDisplay) : null, JSON.stringify(input.gallery),
    input.shortDescription, input.description, input.temperament, input.activityLevel, input.suitableForChildren, input.suitableForDogs,
    input.suitableForCats, input.suitableForOtherAnimals, input.apartmentSuitable === null ? null : input.apartmentSuitable ? 1 : 0,
    input.beginnerSuitable === null ? null : input.beginnerSuitable ? 1 : 0, input.needsExperiencedOwner ? 1 : 0,
    input.vaccinationStatus, input.chipped === null ? null : input.chipped ? 1 : 0, input.neutered === null ? null : input.neutered ? 1 : 0,
    input.healthNotes, input.specialNeeds, input.adoptionRequirements, input.externalSourceUrl, input.contactEmail, input.contactPhone,
    input.contactUrl, input.searchText, input.publishedAt, input.lastVerifiedAt, input.updatedAt, input.updatedBy,
  ];
}

export class AdoptionConcurrentEditError extends Error {
  constructor() {
    super("Profil bol medzitým zmenený iným používateľom. Obnov stránku a skontroluj novšiu verziu pred ďalším uložením.");
    this.name = "AdoptionConcurrentEditError";
  }
}

export function isAdoptionConcurrentEditError(error: unknown): error is AdoptionConcurrentEditError {
  return error instanceof AdoptionConcurrentEditError || (error instanceof Error && error.name === "AdoptionConcurrentEditError");
}

export function isAdoptionAdminConflict(error: unknown) {
  return isAdoptionConcurrentEditError(error) || isAdoptionConflict(error);
}

export async function listAdoptionAdminBreedOptions(
  database?: AdoptionD1Database,
  selected?: CanonicalBreedOption | null,
  selectedId?: number | null,
): Promise<AdoptionAdminBreedOptionsResult> {
  const bound = (env as unknown as RuntimeBindings).DB;
  const db = database ?? (bound && typeof bound.prepare === "function" ? bound : null);
  return readCanonicalBreedOptions(db, { selected, selectedId,
    sqlPrimary:true,
  });
}

export async function listAdoptionAdminOrganizationOptions(database?: AdoptionD1Database) {
  const db = requireD1Binding(database);
  const result = await db.prepare("SELECT id, name, slug FROM help_organizations WHERE archived_at IS NULL ORDER BY name COLLATE NOCASE ASC, id ASC")
    .all<AdoptionAdminOrganizationOption>();
  return result.results.map((row) => ({ id: Number(row.id), name: row.name, slug: row.slug }));
}

export async function createAdoptionFromAdmin(payload: ManagedAdoptionInput, editorEmail: string, database?: AdoptionD1Database) {
  const db = requireD1Binding(database);
  const safePayload = payload.status === undefined || payload.status === null || payload.status === ""
    ? { ...payload, status: "DRAFT" }
    : payload;
  return createManagedAdoption(safePayload, editorEmail, db);
}

export async function updateAdoptionFromAdmin(
  id: number,
  payload: ManagedAdoptionInput,
  editorEmail: string,
  expectedUpdatedAt: string,
  database?: AdoptionD1Database,
  recordUnifiedReceipt = false,
  reviewOnSave=false,
) {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  if (!expectedUpdatedAt?.trim()) throw new AdoptionConcurrentEditError();
  const db = requireD1Binding(database);
  const existing = await getAdoptionById(id, db);
  if (!existing) return null;
  if (existing.updatedAt !== expectedUpdatedAt) throw new AdoptionConcurrentEditError();

  const prepared = await prepareAdoptionWritePayload(db, payload, editorEmail, existing,
    recordUnifiedReceipt ? new Date(nextHelpV2Revision(expectedUpdatedAt)) : new Date());
  const statement = db.prepare(
    `UPDATE adoption_dogs SET ${MUTABLE_COLUMNS.map((column) => `${column} = ?`).join(", ")} WHERE id = ? AND updated_at = ?`,
  ).bind(...writeValues(prepared), id, expectedUpdatedAt);
  if(reviewOnSave&&!recordUnifiedReceipt)throw Error("REVIEW_ON_SAVE_REQUIRES_V2");
  const result = (recordUnifiedReceipt ? await commitAdoptionV2AdminEdit(db,statement,{
    id,expectedRevision:expectedUpdatedAt,nextRevision:prepared.updatedAt,editor:prepared.updatedBy,
    companionStatements:reviewOnSave?reviewOnSaveStatements(db as unknown as D1Database,{type:"ADOPTION",id,revision:prepared.updatedAt,actor:prepared.updatedBy}):[],
  }) : await statement.run()) as RunResult;
  const changes = Number(result.meta?.changes ?? result.changes ?? 0);
  if (changes !== 1) throw new AdoptionConcurrentEditError();
  return getAdoptionById(id, db);
}

/** Narrow V2 Notion import: canonical validator resolves the exact intended
 * field, but the SQL write cannot change unrelated content, lifecycle,
 * gallery or freshness metadata. All identity/lock predicates are atomic. */
export async function updateAdoptionV2NotionField(input:{
  database:D1Database;id:number;pageId:string;field:string;value:unknown;revision:string;reservation?:FieldReservation;media?:VerifiedProfileMedia;
}) {
  const {database,id,pageId,field,value,revision}=input;
  const authority=helpAuthorityWriteGuard(input.reservation,"adoptions",id,pageId,field);
  if(!isAdoptionV2Field(field))throw Error("ADOPTION_V2_FIELD_PROTECTED");
  const existing=await getAdoptionById(id,database);
  if(!existing || existing.updatedAt!==revision || existing.status==="ARCHIVED")
    throw Error("ADOPTION_V2_REVISION_CHANGED");
  const [column,key]=ADOPTION_V2_FIELDS[field];
  const patch:ManagedAdoptionInput={};
  if(field==="Plemeno" || field==="Organizácia"){
    if(typeof value!=="string" || (!value.trim()&&!input.reservation?.profileAuthority))throw Error("ADOPTION_V2_RELATION_INVALID");
    const table=field==="Plemeno"?"managed_breeds":"help_organizations";
    const rows=await database.prepare("SELECT id,name,slug FROM "+table+" WHERE lower(trim(name))=lower(trim(?))"+
      (field==="Organizácia"?" AND archived_at IS NULL AND status<>'ARCHIVED'":input.reservation?.profileAuthority?" AND status='published'":"")+" ORDER BY id LIMIT 2").bind(value).all<{id:number;name:string;slug:string}>();
    if(rows.results.length>1)throw Error("ADOPTION_V2_RELATION_AMBIGUOUS");
    const target=rows.results[0];
    // A typed Notion name must not silently unlink an existing canonical
    // relationship just because its new label cannot be resolved.
    if(!target && (input.reservation?.profileAuthority?Boolean(value.trim()):(field==="Plemeno"?existing.breedId:existing.organizationId)))
      throw Error("ADOPTION_V2_RELATION_UNRESOLVED");
    if(field==="Plemeno"){patch.breedId=target?.id??null;patch.breedName=value;}
    else{patch.organizationId=target?.id??null;patch.organizationName=value;patch.organizationSlug=target?.slug??null;}
  }else if(field==="Hlavný obrázok URL"){
    if(typeof value!=="string")throw Error("ADOPTION_V2_IMAGE_INVALID");
    patch.mainImage=input.reservation?.profileAuthority?requireProfileMediaProof("adoptions",value,input.media).url:value.startsWith("https://psipedia.sk/")?value.slice("https://psipedia.sk".length):value;
  }else{
    // The canonical normalizer validates enums, URL, date and numeric ranges.
    Object.assign(patch,{[key]:value});
  }
  const prepared=await prepareAdoptionWritePayload(database,patch,"notion-events-help-sync@psipedia.sk",existing,new Date(nextHelpV2Revision(revision)));
  const preparedValues=writeValues(prepared);
  const values:Record<string,unknown>=Object.fromEntries(MUTABLE_COLUMNS.map((name,index)=>[name,preparedValues[index]]));
  if(adoptionV2Value(field,values[column])!==value)throw Error("ADOPTION_V2_NORMALIZATION_REVIEW");
  const columns:string[]=[column];
  if(field==="Plemeno")columns.push("breed_id");
  if(field==="Organizácia")columns.push("organization_id","organization_slug");
  if(field==="Hlavný obrázok URL")columns.push("thumbnail_display_json","detail_display_json");
  // Search projection must reflect exactly the cells that will be committed,
  // not normalization of unrelated old fields from the form.
  const searchColumns=["name","breed_name","color","region","district","city","organization_name","short_description","temperament"];
  const raw=await database.prepare("SELECT "+searchColumns.join(",")+" FROM adoption_dogs WHERE id=? AND updated_at=?")
    .bind(id,revision).first<Record<string,string|null>>();
  if(!raw)throw Error("ADOPTION_V2_REVISION_CHANGED");
  if(searchColumns.includes(column)){
    values.search_text=normalizeAdoptionSearchText(searchColumns.map(name=>name===column?String(values[name]??""):raw[name]));
    columns.push("search_text");
  }
  columns.push("updated_at","updated_by");
  let relationGuard="",relationArgs:unknown[]=[];
  if(field==="Plemeno" && prepared.breedId!==null){
    relationGuard=" AND EXISTS(SELECT 1 FROM managed_breeds WHERE id=? AND name=?)";
    relationArgs=[prepared.breedId,prepared.breedName];
  }
  if(field==="Organizácia" && prepared.organizationId!==null){
    relationGuard=" AND EXISTS(SELECT 1 FROM help_organizations WHERE id=? AND name=? AND slug IS ? AND archived_at IS NULL)";
    relationArgs=[prepared.organizationId,prepared.organizationName,prepared.organizationSlug];
  }
  const result=await database.prepare("UPDATE adoption_dogs SET "+columns.map(c=>c+"=?").join(",")+
    " WHERE id=? AND updated_at=? AND status<>'ARCHIVED' "+
    "AND NOT EXISTS(SELECT 1 FROM admin_entity_reviews WHERE entity_type='ADOPTION' AND entity_id=adoption_dogs.id) "+
    "AND NOT "+partnerReviewOwnerSql("ADOPTION","adoption_dogs.id")+" "+
    "AND NOT EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind='adoptions' AND record_id=adoption_dogs.id) "+
    "AND EXISTS(SELECT 1 FROM notion_agenda_sync WHERE agenda='adoptions' AND entity_id=adoption_dogs.id AND notion_page_id=?)"+relationGuard+authority.sql)
    .bind(...columns.map(c=>values[c]),id,revision,pageId,...relationArgs,...authority.params).run();
  if(result.meta.changes!==1)throw Error("ADOPTION_V2_WRITE_CONFLICT");
}
