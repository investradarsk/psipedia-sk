export const FCI_STANDARD_TEXT_KEYS = [
  "status_fci",
  "historicky_suhrn", "celkovy_vzhlad", "dolezite_proporcie", "povaha_temperament",
  "hlava_lebecna_cast", "hlava_tvarova_cast", "oci", "usi", "krk", "telo", "chvost",
  "predne_koncatiny", "zadne_koncatiny", "pohyb", "koza", "srst", "farba",
  "vyska_pes_cm", "vyska_suka_cm", "hmotnost_pes_kg", "hmotnost_suka_kg",
  "velkost_hmotnost_poznamka", "chyby", "zavazne_chyby", "diskvalifikacne_chyby",
  "poznamka_chov", "vyuzitie", "fci_skupina_nazov", "fci_sekcia_nazov",
  "zdroj_poznamka",
] as const;

export type FciStandardTextKey = (typeof FCI_STANDARD_TEXT_KEYS)[number];

export type FciStandard = Partial<Record<FciStandardTextKey, string>> & {
  fci_nomenklatura_url?: string;
  fci_standard_pdf?: string;
};

const FCI_SECTION_SK_LABELS: Readonly<Record<string, string>> = {
  "1:1": "Ovčiarske psy",
  "1:2": "Pastierske psy okrem švajčiarskych salašníckych psov",
  "2:1.1": "Pinče",
  "2:1.2": "Bradáče",
  "2:1.3": "Holandské smoushondy",
  "2:1.4": "Čierny ruský teriér",
  "2:2.1": "Molosoidné plemená – mastifový typ",
  "2:2.2": "Molosoidné plemená – horský typ",
  "2:3": "Švajčiarske salašnícke a pastierske psy",
  "3:1": "Veľké a stredné teriéry",
  "3:2": "Malé teriéry",
  "3:3": "Teriéry typu bull",
  "3:4": "Toy teriéry",
  "5:1": "Severské záprahové psy",
  "5:2": "Severské poľovné psy",
  "5:3": "Severské strážne a pastierske psy",
  "5:4": "Európske špice",
  "5:5": "Ázijské špice a príbuzné plemená",
  "5:6": "Primitívne plemená",
  "5:7": "Primitívne plemená – poľovné psy",
  "6:1.1": "Duriče veľkých plemien",
  "6:1.2": "Duriče stredných plemien",
  "6:1.3": "Duriče malých plemien",
  "6:2": "Farbiare",
  "6:3": "Príbuzné plemená",
  "7:1.1": "Kontinentálne stavače – typ braka",
  "7:1.2": "Kontinentálne stavače – typ španiela",
  "7:1.3": "Kontinentálne stavače – typ grifóna",
  "7:2.1": "Britské a írske stavače a setre – pointer",
  "7:2.2": "Britské a írske stavače a setre – seter",
  "8:1": "Retrievery",
  "8:2": "Sliediče",
  "8:3": "Vodné psy",
  "9:1.1": "Bišóny",
  "9:1.2": "Coton de Tuléar",
  "9:1.3": "Levíček",
  "9:2": "Pudle",
  "9:3.1": "Grifóny",
  "9:3.2": "Petit Brabançon",
  "9:4": "Bezsrsté psy",
  "9:5": "Tibetské plemená",
  "9:6": "Čivava",
  "9:7": "Anglické spoločenské španiele",
  "9:8": "Japonský chin a pekinský palácový psík",
  "9:9": "Kontinentálny spoločenský španiel a ďalšie plemená",
  "9:10": "Kromfohrländer",
  "9:11": "Malé molosoidné psy",
  "10:1": "Dlhosrsté alebo strapcovité chrty",
  "10:2": "Hrubosrsté chrty",
  "10:3": "Krátkosrsté chrty",
};

export function publicFciSectionName(group: number, section: string, fallback = "") {
  return FCI_SECTION_SK_LABELS[`${group}:${section.trim()}`] ?? fallback.trim();
}

export function fciMeasurement(value: string | undefined, unit: "cm" | "kg") {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  if (!normalized) return "";
  return new RegExp(`\\b${unit}\\b`, "i").test(normalized) ? normalized : `${normalized} ${unit}`;
}

export function combinedFciMeasurement(values: Array<string | undefined>, unit: "cm" | "kg") {
  const numbers: number[] = [];
  for (const value of values) {
    const matches = value?.match(/\d+(?:[.,]\d+)?/g) ?? [];
    if (matches.length > 2) return "";
    for (const match of matches) numbers.push(Number(match.replace(",", ".")));
  }
  if (!numbers.length || numbers.some((value) => !Number.isFinite(value))) return "";
  const format = (value: number) => String(value).replace(".", ",");
  const minimum = Math.min(...numbers); const maximum = Math.max(...numbers);
  return `${format(minimum)}${minimum === maximum ? "" : `–${format(maximum)}`} ${unit}`;
}

export function publicFciDate(value: string | null | undefined) {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value?.trim() ?? "";
  const [, year, month, day] = match;
  const monthNumber = Number(month); const dayNumber = Number(day);
  if (monthNumber < 1 || monthNumber > 12 || dayNumber < 1 || dayNumber > 31) return value?.trim() ?? "";
  return `${dayNumber}. ${monthNumber}. ${year}`;
}

export type PreparedFciBreed = {
  sourceIndex: number;
  statusFci: string;
  name: string;
  officialFciName: string;
  fciNumber: number;
  origin: string;
  validStandardDate: string | null;
  fciGroup: number;
  fciSectionNumber: string;
  workingTrial: string;
  slug: string;
  importKey: string;
  status: "published" | "draft";
  standard: FciStandard;
  searchText: string;
};

export type FciImportIssue = { index: number; field: string; message: string };

export type PreparedFciImport = {
  total: number;
  records: PreparedFciBreed[];
  errors: FciImportIssue[];
  duplicateFciNumbers: number[];
  duplicateImportKeys: string[];
  duplicateSlugs: string[];
};

type JsonRecord = Record<string, unknown>;

function object(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Záznam plemena nie je objekt.");
  return value as JsonRecord;
}

function cleanText(value: unknown, max = 30_000) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanUrl(value: unknown) {
  const result = cleanText(value, 1_500);
  if (!result) return "";
  try {
    const url = new URL(result);
    return url.protocol === "http:" || url.protocol === "https:" ? result : "";
  } catch {
    return "";
  }
}

export function cleanFciStandard(value: unknown): FciStandard {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const row=value as JsonRecord;const standard:FciStandard={};
  for(const key of FCI_STANDARD_TEXT_KEYS){const text=cleanText(row[key]);if(text)standard[key]=text;}
  for(const key of ["fci_nomenklatura_url","fci_standard_pdf"] as const){const url=cleanUrl(row[key]);if(url)standard[key]=url;}
  return standard;
}

function fciNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number.parseInt(cleanText(value).replace(/\D/g, ""), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 9999 ? parsed : null;
}

function duplicates<T extends string | number>(values: T[]) {
  const seen = new Set<T>();
  const repeated = new Set<T>();
  for (const value of values) (seen.has(value) ? repeated : seen).add(value);
  return [...repeated];
}

export function normalizeBreedSearchText(value: string) {
  return value.toLocaleLowerCase("sk").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim();
}

export function prepareFciBreedImport(value: unknown, maxRecords = 500): PreparedFciImport {
  const source = Array.isArray(value) ? value : object(value).breeds;
  if (!Array.isArray(source)) throw new Error("JSON musí obsahovať top-level pole breeds.");
  if (!source.length || source.length > maxRecords) throw new Error(`Import musí obsahovať 1 až ${maxRecords} plemien.`);

  const records: PreparedFciBreed[] = [];
  const errors: FciImportIssue[] = [];
  for (const [sourceIndex, raw] of source.entries()) {
    try {
      const row = object(raw);
      const name = cleanText(row.nazov_sk, 160);
      const officialFciName = cleanText(row.nazov_fci, 200);
      const number = fciNumber(row.fci_cislo);
      const group = Number(row.fci_skupina);
      const slug = cleanText(row.slug, 120).toLowerCase();
      const importKey = cleanText(row.import_key, 120);
      if (!name) throw new Error("Chýba nazov_sk.");
      if (!officialFciName) throw new Error("Chýba nazov_fci.");
      if (!number) throw new Error("Chýba alebo je neplatné fci_cislo.");
      if (!Number.isInteger(group) || group < 1 || group > 10) throw new Error("fci_skupina musí byť číslo 1 až 10.");
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Slug má neplatný formát.");
      if (!/^plemena:fci-\d{4}$/.test(importKey)) throw new Error("import_key musí mať formát plemena:fci-####.");
      if (importKey !== `plemena:fci-${String(number).padStart(4,"0")}`) throw new Error("import_key nezodpovedá fci_cislo.");

      const standard: FciStandard = {};
      for (const key of FCI_STANDARD_TEXT_KEYS) {
        const text = cleanText(row[key]);
        if (text) standard[key] = text;
      }
      for (const key of ["fci_nomenklatura_url", "fci_standard_pdf"] as const) {
        const rawUrl = cleanText(row[key]);
        const url = cleanUrl(row[key]);
        if (rawUrl && !url) throw new Error(`${key} musí byť platná http/https URL.`);
        if (url) standard[key] = url;
      }

      const origin = cleanText(row.krajina_povodu, 200);
      records.push({
        sourceIndex,
        statusFci: cleanText(row.status_fci, 100),
        name,
        officialFciName,
        fciNumber: number,
        origin,
        validStandardDate: cleanText(row.datum_platneho_standardu, 40) || null,
        fciGroup: group,
        fciSectionNumber: cleanText(row.fci_sekcia, 80),
        workingTrial: cleanText(row.pracovna_skuska, 160),
        slug,
        importKey,
        status: cleanText(row.status).toLowerCase() === "published" ? "published" : "draft",
        standard,
        searchText: normalizeBreedSearchText([name, officialFciName, origin, standard.fci_skupina_nazov, standard.fci_sekcia_nazov].filter(Boolean).join(" ")),
      });
    } catch (error) {
      errors.push({ index: sourceIndex + 1, field: "record", message: error instanceof Error ? error.message : "Neplatný záznam." });
    }
  }

  const duplicateFciNumbers = duplicates(records.map((record) => record.fciNumber));
  const duplicateImportKeys = duplicates(records.map((record) => record.importKey));
  const duplicateSlugs = duplicates(records.map((record) => record.slug));
  for (const value of duplicateFciNumbers) errors.push({ index: 0, field: "fci_cislo", message: `Duplicitné FCI číslo: ${value}.` });
  for (const value of duplicateImportKeys) errors.push({ index: 0, field: "import_key", message: `Duplicitný import key: ${value}.` });
  for (const value of duplicateSlugs) errors.push({ index: 0, field: "slug", message: `Duplicitný slug: ${value}.` });

  return { total:source.length,records, errors, duplicateFciNumbers, duplicateImportKeys, duplicateSlugs };
}
