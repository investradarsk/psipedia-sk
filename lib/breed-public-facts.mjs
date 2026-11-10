import { formatBreedNumericRange } from "./breed-controlled-fields.mjs";

const selected = value => typeof value === "string" ? value.trim() : "";
const listed = value => Array.isArray(value)
  ? value.filter(item => typeof item === "string" && item.trim()).join(", ")
  : "";
const range = (from,to,kind) =>
  typeof from === "number" && typeof to === "number"
    ? formatBreedNumericRange(from,to,kind) ?? ""
    : "";

/**
 * Transitional display contract: prefer valid typed Admin values; when a new
 * field is missing, keep the published legacy value. This is read-only and
 * never rewrites or infers Notion values from FCI expert descriptions.
 */
export function resolvePublicBreedFacts(legacy,controlled) {
  const v=controlled??{};
  return {
    origin: listed(v.originCountries) || legacy.origin || "",
    size: selected(v.sizeSelect) || legacy.size || "",
    coatTypes: listed(v.coatTypes),
    height: range(v.heightMinCm,v.heightMaxCm,"height") || legacy.height || "",
    weight: range(v.weightMinKg,v.weightMaxKg,"weight") || legacy.weight || "",
    lifespan: range(v.lifespanMinYears,v.lifespanMaxYears,"lifespan") || legacy.lifespan || "",
    useTypes: listed(v.useTypes),
    fciGroup: selected(v.fciGroupSelect) || String(legacy.fciGroup||""),
    fciSection: selected(v.fciSectionSelect) || legacy.fciSection || "",
  };
}
