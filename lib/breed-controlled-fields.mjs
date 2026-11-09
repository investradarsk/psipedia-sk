/**
 * The controlled-choice vocabulary for breed editorial metadata.
 * A descriptive legacy field is never silently coerced into a category.
 */
export const FCI_GROUP_OPTIONS = Object.freeze([
  [1, "Ovčiarske a pastierske psy"],
  [2, "Pinče, bradáče, molosoidné a salašnícke psy"],
  [3, "Teriéry"],
  [4, "Jazvečíky"],
  [5, "Špice a primitívne plemená"],
  [6, "Duriče, farbiare a príbuzné plemená"],
  [7, "Stavače"],
  [8, "Retrievery, sliediče a vodné psy"],
  [9, "Spoločenské a sprievodné psy"],
  [10, "Chrty"],
]);

export const BREED_SIZE_OPTIONS = Object.freeze([
  "Miniatúrne plemeno",
  "Malé plemeno",
  "Stredne veľké plemeno",
  "Veľké plemeno",
  "Obrie plemeno",
]);

/** Canonical country names in Slovak, including commonly used FCI origins. */
export const BREED_ORIGIN_COUNTRIES = Object.freeze([
  "Afganistan", "Albánsko", "Alžírsko", "Argentína", "Arménsko", "Austrália",
  "Belgicko", "Bielorusko", "Bosna a Hercegovina", "Brazília", "Bulharsko",
  "Česko", "Čína", "Dánsko", "Egypt", "Estónsko", "Etiópia", "Fínsko",
  "Francúzsko", "Grécko", "Holandsko", "Chorvátsko", "India", "Indonézia",
  "Irán", "Írsko", "Island", "Izrael", "Japonsko", "Južná Afrika",
  "Kanada", "Kazachstan", "Kórea", "Kuba", "Kirgizsko", "Litva",
  "Lotyšsko", "Maďarsko", "Maroko", "Mexiko", "Mongolsko",
  "Nemecko", "Nórsko", "Nový Zéland", "Pakistan", "Peru", "Poľsko",
  "Portugalsko", "Rakúsko", "Rumunsko", "Rusko", "Slovensko",
  "Slovinsko", "Spojené štáty americké", "Srbsko", "Španielsko",
  "Švajčiarsko", "Švédsko", "Taliansko", "Thajsko", "Tibet",
  "Turecko", "Turkménsko", "Ukrajina", "Uruguaj", "Veľká Británia",
  "Vietnam"
].sort((a, b) => a.localeCompare(b, "sk")));

/** A taxonomy, not a replacement for a descriptive FCI coat paragraph. */
export const BREED_COAT_TYPES = Object.freeze([
  "Krátka hladká", "Krátka s podsadou", "Stredne dlhá",
  "Dlhá", "Drsná / hrubá", "Kučeravá", "Hodvábna",
  "Bezsrstá", "Šnúrovitá", "Dvojitá srsť",
]);

export const BREED_USE_TYPES = Object.freeze([
  "Spoločenský", "Pastiersky", "Strážny", "Poľovnícky",
  "Durič", "Retriever", "Sliedič", "Stavač",
  "Pracovný / služobný", "Záprahový", "Záchranársky",
  "Športový", "Chrty / coursing",
]);

const UNITS = Object.freeze({ height:"cm", weight:"kg", lifespan:"rokov" });
const BOUNDS = Object.freeze({ height:[8,130], weight:[0.5,150], lifespan:[3,30] });
const DECIMAL = String.raw`(?:\d+(?:[.,]\d+)?)`;
const numberText = new RegExp(String.raw`^\s*(${DECIMAL})(?:\s*[–—-]\s*(${DECIMAL}))?\s*(cm|kg|rokov)?\s*$ `.trim(), "i");

export function parseBreedNumericRange(value, kind) {
  if (!Object.hasOwn(UNITS, kind) || typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  const match = numberText.exec(text);
  if (!match || (match[3] && match[3].toLowerCase() !== UNITS[kind])) return null;
  const min = Number(match[1].replace(",", "."));
  const max = match[2] ? Number(match[2].replace(",", ".")) : min;
  const [low, high] = BOUNDS[kind];
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < low || max > high || min > max) return null;
  return { min, max, unit:UNITS[kind] };
}

export function formatBreedNumericRange(min, max, kind) {
  const [low, high] = BOUNDS[kind] ?? [];
  if (!Number.isFinite(min) || !Number.isFinite(max) ||
      min < low || max > high || min > max) return null;
  const a = String(min).replace(".", ",");
  const b = String(max).replace(".", ",");
  return a + (min === max ? "" : "–" + b) + " " + UNITS[kind];
}

/**
 * During phased migration, accept only a decimal or two decimals joined by
 * a dash; a sentence, sex label, tolerance or unit from another kind is not
 * a number. Existing raw descriptions are preserved until explicitly edited.
 */
export function isBreedNumericDraft(value, kind) {
  if (!Object.hasOwn(UNITS, kind) || typeof value !== "string") return false;
  if (!value.trim()) return true;
  const escaped = UNITS[kind];
  return new RegExp(String.raw`^\s*\d*(?:[.,]\d*)?(?:\s*[–—-]\s*\d*(?:[.,]\d*)?)?\s*(?:${escaped})?\s*$ `.trim(),"i").test(value);
}

/** Applies to specific logical Notion/D1 keys; never to FCI narrative prose. */
export function breedNumericKindForField(field) {
  if (field === "height" || /^fciStandard\.vyska_(pes|suka)_cm$/.test(field)) return "height";
  if (field === "weight" || /^fciStandard\.hmotnost_(pes|suka)_kg$/.test(field)) return "weight";
  if (field === "lifespan") return "lifespan";
  return null;
}

export function isBreedStructuredMeasurement(field, value) {
  const kind = breedNumericKindForField(field);
  return !kind || (typeof value === "string" && parseBreedNumericRange(value, kind) !== null);
}
