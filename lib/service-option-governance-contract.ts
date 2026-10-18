/**
 * SERVICES V3 phase 1 — contract ONLY, not an authorization check.
 * Future write API must verify real Admin identity on the server, enforce CAS,
 * allocate immutable IDs and write to D1 before updating the Notion mirror.
 */
import {serviceCatalog,attributeCatalog,providerTypeCatalog,normalizeCatalogLabel} from "./service-catalog-contract.ts";
import {serviceFilterCategories,type ServiceFilterCategory} from "./directory-filter-contract.ts";
export const SERVICE_OPTION_GOVERNANCE={
  creator:"psipedia_admin",sourceOfTruth:"d1",
  notion:"mirror_only",gemini:"proposal_only",partner:"proposal_only",
  selectedStates:["yes","no"],untouchedLegacyIsNo:false,
  idPolicy:"immutable_server_allocated",approval:"authorized_admin",
} as const;
export type CatalogOptionDraft=Readonly<{name:string;category:string;kind:"service"|"attribute";group:string}>;
export function validateCatalogOptionDraft(input:CatalogOptionDraft){
  const name=input.name.normalize("NFC").trim().replace(/\s+/g," ");
  const group=input.group.normalize("NFC").trim().replace(/\s+/g," ");
  if(name.length<3||name.length>100)throw Error("Invalid option name.");
  if(group.length<2||group.length>80)throw Error("Invalid option group.");
  if(!(serviceFilterCategories as readonly string[]).includes(input.category))throw Error("Invalid category.");
  if(input.kind!=="service"&&input.kind!=="attribute")throw Error("Invalid option kind.");
  // One global identity even when the same service is offered in another category.
  // Existing canonical options must be reused/extended by an authorized Admin;
  // creating a second ID with the same name or alias is invalid.
  if([...serviceCatalog,...attributeCatalog,...providerTypeCatalog].some(x=>normalizeCatalogLabel(x.label)===normalizeCatalogLabel(name)))
    throw Error("Option already exists; reuse its canonical ID.");
  if(serviceCatalog.some(x=>x.aliases.some(a=>normalizeCatalogLabel(a)===normalizeCatalogLabel(name))))
    throw Error("Option already exists as alias; reuse its canonical ID.");
  return {name,category:input.category as ServiceFilterCategory,kind:input.kind,group};
}
