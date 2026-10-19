/**
 * SERVICES V3 phase 3A — types and *pure* lifecycle rules for the future Admin editor.
 * This module does not authorize requests or mutate D1 / Notion.
 * Phase 3C exposes gated lifecycle Admin mutations; mirror SUCCESS/CONFLICT is an internal-only reconciler outcome.
 */
export const CATALOG_OPTION_STATES=["DRAFT","ACTIVE","RETIRED"] as const;
export const CATALOG_MIRROR_STATES=["PENDING","SYNCED","CONFLICT"] as const;
export const CATALOG_EDITOR_CHOICES=["yes","no","unknown"] as const;
export type CatalogOptionStatus=typeof CATALOG_OPTION_STATES[number];
export type CatalogMirrorStatus=typeof CATALOG_MIRROR_STATES[number];
export type CatalogEditorChoice=typeof CATALOG_EDITOR_CHOICES[number];
export type CatalogExplicitChoice=Exclude<CatalogEditorChoice,"unknown">;

export type AdminCatalogOptionDto=Readonly<{
  id:string;
  kind:"service"|"attribute";
  label:string;
  group:string;
  meaning:string;
  categories:readonly string[];
  status:CatalogOptionStatus;
  notionMirrorStatus:CatalogMirrorStatus;
  version:number;
}>;
export type CreateAdminCatalogOptionRequest=Readonly<{
  name:string;
  category:string;
  kind:"service"|"attribute";
  group:string;
  meaning:string;
}>;
export type SaveAdminServiceChoiceRequest=Readonly<{
  optionId:string;
  choice:CatalogExplicitChoice;
  expectedVersion:number; // 0 = insert only; positive integer = compare-and-swap
}>;
export type MutateAdminCatalogOptionRequest=Readonly<
  |{action:"edit";expectedVersion:number;name:string;category:string;group:string;meaning:string}
  |{action:"approve"|"retire"|"retryMirror";expectedVersion:number}
>;
export type ResetAdminServiceChoiceRequest=Readonly<{optionId:string;choice:"unknown";expectedVersion:number}>;
export type AdminServiceChoiceWriteResult=AdminServiceChoiceDto|Readonly<{profileId:number;optionId:string;choice:"unknown";version:0}>;
export type AdminServiceChoiceDto=Readonly<{
  profileId:number;
  optionId:string;
  choice:CatalogExplicitChoice;
  version:number;
}>;

/** No stored row means unknown; never infer an explicit "no". */
export function selectionForEditor(row:Pick<AdminServiceChoiceDto,"choice">|null|undefined):CatalogEditorChoice{
  return row?.choice??"unknown";
}

/** Lifecycle edge validation: always re-check it inside the CAS writer. */
export function canTransitionCatalogStatus(from:CatalogOptionStatus,to:CatalogOptionStatus,mirror:CatalogMirrorStatus):boolean{
  if(from===to)return true; // unchanged status, not a transition
  if(from==="RETIRED")return false; // immutable retirement; create a new ID only after governance review
  if(to==="RETIRED")return true;
  return from==="DRAFT"&&to==="ACTIVE"&&mirror==="SYNCED";
}
/** Notion is a mirror, never the source of canonical IDs. */
export function canTransitionMirrorStatus(from:CatalogMirrorStatus,to:CatalogMirrorStatus):boolean{
  if(from===to)return true;
  if(from==="PENDING")return to==="SYNCED"||to==="CONFLICT";
  if(from==="SYNCED")return to==="PENDING"||to==="CONFLICT";
  return to==="PENDING"; // CONFLICT must be explicitly retried, not silently certified
}
