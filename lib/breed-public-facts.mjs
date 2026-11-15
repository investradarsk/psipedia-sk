import { formatBreedNumericRange } from "./breed-controlled-fields.mjs";

const selected = value => typeof value === "string" ? value.trim() : "";
const listed = value => Array.isArray(value)
  ? value.filter(item => typeof item === "string" && item.trim()).join(", ")
  : "";
const range = (from,to,kind) =>
  typeof from === "number" && typeof to === "number"
    ? formatBreedNumericRange(from,to,kind) ?? ""
    : "";

/** A fact's source describes the *visible* value, not all stored alternatives.
 * The admin preview and the public profile must never implement separate
 * controlled-vs-legacy precedence rules. */
export function resolvePublicBreedFactsWithSources(legacy,controlled,sourceHints={}) {
  const v=controlled??{};
  const facts={};
  const sources={};
  const selectFact=(key,preferred,fallback,legacySource="legacy")=>{
    const value=preferred||fallback||"";
    facts[key]=value;
    sources[key]=preferred?"controlled":fallback?legacySource:"none";
  };
  selectFact("origin",listed(v.originCountries),legacy.origin);
  selectFact("size",selected(v.sizeSelect),legacy.size);
  selectFact("coatTypes",listed(v.coatTypes),"");
  selectFact("height",range(v.heightMinCm,v.heightMaxCm,"height"),legacy.height,sourceHints.height??"legacy");
  selectFact("weight",range(v.weightMinKg,v.weightMaxKg,"weight"),legacy.weight,sourceHints.weight??"legacy");
  selectFact("lifespan",range(v.lifespanMinYears,v.lifespanMaxYears,"lifespan"),legacy.lifespan);
  selectFact("useTypes",listed(v.useTypes),"");
  selectFact("fciGroup",selected(v.fciGroupSelect),String(legacy.fciGroup||""));
  selectFact("fciSection",selected(v.fciSectionSelect),legacy.fciSection);
  return {facts,sources};
}

/** Public page and Admin use exactly the same resolver; no writes or imports. */
export function resolvePublicBreedFacts(legacy,controlled) {
  return resolvePublicBreedFactsWithSources(legacy,controlled).facts;
}
