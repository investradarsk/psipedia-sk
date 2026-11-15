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
  const choose=(preferred,fallback,legacySource="legacy")=>({
    value:preferred||fallback||"",
    source:preferred?"controlled":fallback?legacySource:"none",
  });
  const origin=choose(listed(v.originCountries),legacy.origin);
  const size=choose(selected(v.sizeSelect),legacy.size);
  const coatTypes=choose(listed(v.coatTypes),"");
  const height=choose(range(v.heightMinCm,v.heightMaxCm,"height"),legacy.height,sourceHints.height??"legacy");
  const weight=choose(range(v.weightMinKg,v.weightMaxKg,"weight"),legacy.weight,sourceHints.weight??"legacy");
  const lifespan=choose(range(v.lifespanMinYears,v.lifespanMaxYears,"lifespan"),legacy.lifespan);
  const useTypes=choose(listed(v.useTypes),"");
  const fciGroup=choose(selected(v.fciGroupSelect),String(legacy.fciGroup||""));
  const fciSection=choose(selected(v.fciSectionSelect),legacy.fciSection);
  return {
    facts:{
      origin:origin.value,size:size.value,coatTypes:coatTypes.value,
      height:height.value,weight:weight.value,lifespan:lifespan.value,
      useTypes:useTypes.value,fciGroup:fciGroup.value,fciSection:fciSection.value,
    },
    sources:{
      origin:origin.source,size:size.source,coatTypes:coatTypes.source,
      height:height.source,weight:weight.source,lifespan:lifespan.source,
      useTypes:useTypes.source,fciGroup:fciGroup.source,fciSection:fciSection.source,
    },
  };
}

/** Public page and Admin use exactly the same resolver; no writes or imports. */
export function resolvePublicBreedFacts(legacy,controlled) {
  return resolvePublicBreedFactsWithSources(legacy,controlled).facts;
}
