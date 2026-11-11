/**
 * Read-only 90-column work-copy projection for the existing Admin snapshot parser.
 * Every Admin field has a distinct Notion source. No 60-column merged-segment
 * expansion and no mutation of the linked Notion record happens here.
 */
import { BREED_NOTION_SCHEMA } from "./notion-breed-property-registry.ts";
import { breedWorkcopyPhysicalProperty } from "./breed-notion-workcopy-field-contract.mjs";

function plain(p) {
  if (p?.type === "number") return p.number == null ? "" : String(p.number);
  const items=p?.rich_text ?? p?.title;
  return Array.isArray(items) ? items.map(x => x.plain_text ?? x.text?.content ?? "").join("").trim() : "";
}
function textProperty(value) {
  return { type:"rich_text", rich_text:[{type:"text",plain_text:value,text:{content:value}}] };
}
export function materializeBreedWorkCopyForRead(workPage, canonical, _options) {
  if (!canonical || !Number.isSafeInteger(Number(canonical.id)) ||
      !/^[a-z0-9-]{2,90}$/.test(String(canonical.slug ?? "")))
    throw Error("BREED_WORKCOPY_CANONICAL_IDENTITY_MISSING");
  if (plain(workPage?.properties?.["Psipedia ID"]) !== String(canonical.id))
    throw Error("BREED_WORKCOPY_PSI_ID_MISMATCH");
  const source=workPage?.properties ?? {};
  const properties={...source};
  for (const field of BREED_NOTION_SCHEMA) {
    if (field.mode !== "content") continue;
    const physical=breedWorkcopyPhysicalProperty(field.notion);
    if (physical && Object.hasOwn(source,physical))
      properties[field.notion]=source[physical];
  }
  // Canonical slug is for read-only parser compatibility. Notion cannot edit ID.
  properties.Slug=textProperty(String(canonical.slug));
  return {
    valid:true,errors:[],page:{...workPage,properties},
    sourcePropertyNames:Object.keys(source),
    derivedPropertyNames:Object.keys(properties).filter(name=>!Object.hasOwn(source,name)),
    writebackAllowed:false,
  };
}
