import {
  canonicalizeSourceUrl,
  isSafeAutomationSourceUrl,
  normalizeAutomationIdentity,
  type AutomationLifecycleSignal,
  type AutomationSourceConfig,
  type AutomationSourceRecord,
} from "./data-automation.ts";

export const AUTOMATION_ADOPTION_NORMALIZATION_VERSION = 1 as const;

function clean(value: unknown, max = 5000) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).normalize("NFC").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : null;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function named(value: unknown) {
  if (typeof value === "string") return clean(value, 500);
  const item = object(value);
  return clean(item.name ?? item.title ?? item.value, 500);
}

function safePublicUrl(value: unknown) {
  const url = canonicalizeSourceUrl(value);
  return url && isSafeAutomationSourceUrl(url) ? url : null;
}

function validDateParts(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null;
  return String(year) + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
}

function exactDate(value: unknown) {
  const text = clean(value, 120);
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (iso) return validDateParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const slovak = text.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  if (!slovak) return null;
  return validDateParts(Number(slovak[3]), Number(slovak[2]), Number(slovak[1]));
}

function genericAdoptionName(value: unknown) {
  const normalized = normalizeAutomationIdentity(value);
  if (!normalized) return true;
  return /^(?:psy?\s+na\s+adopciu|adopcia|hladame\s+domov|hladame\s+novy\s+domov|adoptujte\s+(?:psika|psa)|nasi\s+zverenci|psy?\s+hladaju\s+domov|zvierata\s+na\s+adopciu)$/.test(normalized);
}

function explicitName(value: unknown) {
  const text = clean(value, 160);
  return text && !genericAdoptionName(text) ? text : null;
}

function explicitSex(value: unknown) {
  const normalized = normalizeAutomationIdentity(value);
  if (normalized === "male" || normalized === "pes" || normalized === "samec") return "MALE";
  if (normalized === "female" || normalized === "fenka" || normalized === "samica") return "FEMALE";
  return null;
}

function explicitAgeMonths(value: unknown) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 && value <= 360 ? value : null;
  }
  const text = clean(value, 200)?.toLocaleLowerCase("sk-SK");
  if (!text) return null;
  if (/^\d{1,3}$/.test(text)) {
    const direct = Number(text);
    return Number.isSafeInteger(direct) && direct >= 0 && direct <= 360 ? direct : null;
  }
  const years = text.match(/(\d{1,2})\s*(?:rok|roky|rokov|year|years)\b/)?.[1];
  const months = text.match(/(\d{1,2})\s*(?:mesiac|mesiace|mesiacov|month|months)\b/)?.[1];
  if (!years && !months) return null;
  const total = Number(years ?? 0) * 12 + Number(months ?? 0);
  return Number.isSafeInteger(total) && total >= 0 && total <= 360 ? total : null;
}

function explicitWeight(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 && value < 150 ? value : null;
  const text = clean(value, 120);
  if (!text) return null;
  const match = text.replace(",", ".").match(/(?:^|\s)(\d{1,3}(?:\.\d{1,2})?)\s*(?:kg)?(?:\s|$)/i);
  if (!match) return null;
  const result = Number(match[1]);
  return Number.isFinite(result) && result > 0 && result < 150 ? result : null;
}

function explicitBreed(value: unknown) {
  const text = clean(value, 300);
  if (!text) return { breedName: null, breedMix: null as boolean | null };
  const normalized = normalizeAutomationIdentity(text);
  const breedMix = /(?:^|\s)(?:krizenec|mix|miesenec|crossbreed|mixed)(?:\s|$)/.test(normalized);
  return { breedName: text, breedMix };
}

function structuredFacts(rawRecord: unknown) {
  const raw = object(rawRecord);
  const structured = object(raw.structured);
  const address = object(structured.address);
  const location = object(structured.location);
  const locationAddress = object(location.address);
  return {
    name: explicitName(structured.name ?? structured.headline),
    sex: clean(structured.sex ?? structured.gender, 120),
    birthDate: exactDate(structured.birthDate ?? structured.birth_date ?? structured.dateOfBirth),
    age: structured.age ?? structured.approximateAge ?? structured.approximateAgeMonths,
    breed: clean(structured.breed ?? structured.breedName, 300),
    size: clean(structured.size, 160),
    weight: structured.weight,
    color: clean(structured.color, 160),
    city: clean(
      structured.city
      ?? locationAddress.addressLocality
      ?? address.addressLocality,
      200,
    ),
    district: clean(structured.district, 200),
    region: clean(
      structured.region
      ?? locationAddress.addressRegion
      ?? address.addressRegion,
      200,
    ),
    organization: named(structured.organization ?? structured.shelter),
    description: clean(structured.description, 5000),
    status: clean(structured.status, 300),
  };
}

function adoptionText(record: AutomationSourceRecord) {
  const raw = object(record.rawRecord);
  return [
    raw.pageTextExcerpt,
    raw.contentExcerpt,
    raw.detailText,
    record.proposed.description,
    record.proposed.shortDescription,
  ]
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .join("\n")
    .slice(0, 20_000);
}

function labelledFacts(text: string) {
  const facts: Record<string, string> = {};
  const mappings: Array<[string, RegExp]> = [
    ["name", /^(?:meno|name)\s*[:–—-]\s*(.+)$/i],
    ["sex", /^(?:pohlavie|sex|gender)\s*[:–—-]\s*(.+)$/i],
    ["age", /^(?:vek|age)\s*[:–—-]\s*(.+)$/i],
    ["birthDate", /^(?:d[aá]tum\s+narodenia|naroden[ýy]|date\s+of\s+birth)\s*[:–—-]\s*(.+)$/i],
    ["breed", /^(?:plemeno|rasa|breed)\s*[:–—-]\s*(.+)$/i],
    ["size", /^(?:ve[lľ]kos[tť]|size)\s*[:–—-]\s*(.+)$/i],
    ["weight", /^(?:v[aá]ha|hmotnos[tť]|weight)\s*[:–—-]\s*(.+)$/i],
    ["color", /^(?:farba|color|colour)\s*[:–—-]\s*(.+)$/i],
    ["city", /^(?:mesto|city)\s*[:–—-]\s*(.+)$/i],
    ["district", /^(?:okres|district)\s*[:–—-]\s*(.+)$/i],
    ["region", /^(?:kraj|regi[oó]n|region)\s*[:–—-]\s*(.+)$/i],
    ["organization", /^(?:[uú]tulok|organiz[aá]cia|organization|shelter)\s*[:–—-]\s*(.+)$/i],
    ["status", /^(?:stav|status)\s*[:–—-]\s*(.+)$/i],
  ];
  const lines = text
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .map((line) => line.replace(/^\s*[-*#>]+\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 300);
  for (const line of lines) {
    for (const [key, pattern] of mappings) {
      if (facts[key]) continue;
      const value = line.match(pattern)?.[1]?.trim();
      if (value) facts[key] = value.slice(0, 1000);
    }
  }

  const flat = text.replace(/\s+/g, " ").trim();
  const labels = "(?:meno|name|pohlavie|sex|gender|vek|age|d[aá]tum\\s+narodenia|naroden[ýy]|date\\s+of\\s+birth|plemeno|rasa|breed|ve[lľ]kos[tť]|size|v[aá]ha|hmotnos[tť]|weight|farba|color|colour|mesto|city|okres|district|kraj|regi[oó]n|region|[uú]tulok|organiz[aá]cia|organization|shelter|stav|status)";
  const flatMappings: Array<[string, string]> = [
    ["name", "(?:meno|name)"],
    ["sex", "(?:pohlavie|sex|gender)"],
    ["age", "(?:vek|age)"],
    ["birthDate", "(?:d[aá]tum\\s+narodenia|naroden[ýy]|date\\s+of\\s+birth)"],
    ["breed", "(?:plemeno|rasa|breed)"],
    ["size", "(?:ve[lľ]kos[tť]|size)"],
    ["weight", "(?:v[aá]ha|hmotnos[tť]|weight)"],
    ["color", "(?:farba|color|colour)"],
    ["city", "(?:mesto|city)"],
    ["district", "(?:okres|district)"],
    ["region", "(?:kraj|regi[oó]n|region)"],
    ["organization", "(?:[uú]tulok|organiz[aá]cia|organization|shelter)"],
    ["status", "(?:stav|status)"],
  ];
  for (const [key, label] of flatMappings) {
    if (facts[key]) continue;
    const pattern = new RegExp(
      "(?:^|\\s)" + label + "\\s*[:–—-]\\s*(.{1,1000}?)(?=\\s+" + labels + "\\s*[:–—-]|$)",
      "i",
    );
    const value = flat.match(pattern)?.[1]?.trim();
    if (value) facts[key] = value.slice(0, 1000);
  }
  return facts;
}

function explicitLifecycleStatus(value: unknown) {
  const normalized = normalizeAutomationIdentity(value);
  if (!normalized) return null;
  if (/^(?:adoptovany|adoptovana|adopted|nasiel\s+domov|nasla\s+domov)$/.test(normalized)) {
    return { signalType: "ADOPTION_ADOPTED" as const, targetState: "ADOPTED", evidenceText: clean(value, 240)! };
  }
  if (/^(?:rezervovany|rezervovana|reserved)$/.test(normalized)) {
    return { signalType: "ADOPTION_RESERVED" as const, targetState: "RESERVED", evidenceText: clean(value, 240)! };
  }
  return null;
}

function explicitLifecycleLine(text: string) {
  const lines = text
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .map((line) => line.replace(/^\s*[-*#>]+\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 300);
  for (const line of lines) {
    const signal = explicitLifecycleStatus(line);
    if (signal) return signal;
  }
  return null;
}

export function normalizeAutomationAdoptionRecord(
  record: AutomationSourceRecord,
  options: { sourceConfig?: AutomationSourceConfig } = {},
): AutomationSourceRecord {
  const p = { ...record.proposed };
  const structured = structuredFacts(record.rawRecord);
  const labelled = labelledFacts(adoptionText(record));
  const sourceOrganization = clean(options.sourceConfig?.staticFields?.organizationName, 500);

  const proposedName = explicitName(p.name ?? p.dogName);
  const labelledName = explicitName(labelled.name);
  const name = proposedName ?? structured.name ?? labelledName;
  const proposed: Record<string, unknown> = { ...p };
  if (genericAdoptionName(p.name ?? p.dogName)) {
    delete proposed.name;
    delete proposed.dogName;
  }
  if (name) proposed.name = name;

  const sex = explicitSex(p.sex) ?? explicitSex(structured.sex) ?? explicitSex(labelled.sex);
  if (sex) proposed.sex = sex;

  const birthDate = exactDate(p.birthDate ?? p.birth_date)
    ?? structured.birthDate
    ?? exactDate(labelled.birthDate);
  if (birthDate) proposed.birthDate = birthDate;

  const ageMonths = explicitAgeMonths(p.approximateAgeMonths ?? p.approximate_age_months ?? p.approximateAge)
    ?? explicitAgeMonths(structured.age)
    ?? explicitAgeMonths(labelled.age);
  if (ageMonths !== null) proposed.approximateAgeMonths = ageMonths;

  const breed = explicitBreed(p.breedName ?? p.breed_name ?? p.breed ?? structured.breed ?? labelled.breed);
  if (breed.breedName) proposed.breedName = breed.breedName;
  if (typeof p.breedMix === "boolean") proposed.breedMix = p.breedMix;
  else if (typeof p.breed_mix === "boolean") proposed.breedMix = p.breed_mix;
  else if (breed.breedMix !== null) proposed.breedMix = breed.breedMix;

  const size = clean(p.size ?? structured.size ?? labelled.size, 160);
  if (size) proposed.size = size;
  const weight = explicitWeight(p.weight ?? structured.weight ?? labelled.weight);
  if (weight !== null) proposed.weight = weight;
  const color = clean(p.color ?? structured.color ?? labelled.color, 160);
  if (color) proposed.color = color;

  const city = clean(p.city ?? structured.city ?? labelled.city, 200);
  const district = clean(p.district ?? structured.district ?? labelled.district, 200);
  const region = clean(p.region ?? structured.region ?? labelled.region, 200);
  if (city) proposed.city = city;
  if (district) proposed.district = district;
  if (region) proposed.region = region;

  const explicitOrganization = clean(p.organizationName ?? p.organization, 500);
  const organization = explicitOrganization
    ?? structured.organization
    ?? clean(labelled.organization, 500)
    ?? sourceOrganization;
  if (organization) proposed.organizationName = organization;

  const shortDescription = clean(p.shortDescription ?? p.short_description, 1000);
  const description = clean(p.description, 5000) ?? structured.description;
  if (shortDescription) proposed.shortDescription = shortDescription;
  if (description) proposed.description = description;

  const externalSourceUrl = safePublicUrl(p.externalSourceUrl ?? p.external_source_url)
    ?? safePublicUrl(record.extraction?.itemUrl)
    ?? safePublicUrl(record.sourceUrl);
  if (externalSourceUrl) proposed.externalSourceUrl = externalSourceUrl;

  const verifiedAt = clean(
    p.lastVerifiedAt
    ?? p.last_verified_at
    ?? record.extraction?.evidenceMetadata?.retrievedAt
    ?? record.sourceTimestamp,
    80,
  );
  if (verifiedAt && Number.isFinite(Date.parse(verifiedAt))) proposed.lastVerifiedAt = new Date(verifiedAt).toISOString();

  const lifecycle = explicitLifecycleStatus(p.status ?? structured.status ?? labelled.status)
    ?? explicitLifecycleLine(adoptionText(record));
  if (lifecycle) delete proposed.status;
  const lifecycleSignals: AutomationLifecycleSignal[] = [...(record.lifecycleSignals ?? [])];
  if (lifecycle && !lifecycleSignals.some((signal) => signal.signalType === lifecycle.signalType)) {
    lifecycleSignals.push({
      signalType: lifecycle.signalType,
      targetState: lifecycle.targetState,
      evidenceText: lifecycle.evidenceText,
      confidenceClass: "EXPLICIT",
    });
  }

  const profileEvidence = Boolean(
    sex
    || birthDate
    || ageMonths !== null
    || breed.breedName
    || size
    || weight !== null
    || color
  );

  const adoptionNormalization = {
    version: AUTOMATION_ADOPTION_NORMALIZATION_VERSION,
    normalizedFields: Object.keys(proposed)
      .filter((key) => proposed[key] !== undefined && proposed[key] !== null && proposed[key] !== ""),
    genericNameRejected: Boolean(clean(p.name ?? p.dogName) && !proposedName),
    organizationSource: explicitOrganization
      ? "RECORD"
      : structured.organization
        ? "STRUCTURED"
        : clean(labelled.organization, 500)
          ? "LABELLED"
          : sourceOrganization
            ? "SOURCE_STATIC"
            : null,
    explicitAdopted: lifecycle?.signalType === "ADOPTION_ADOPTED",
    explicitReserved: lifecycle?.signalType === "ADOPTION_RESERVED",
    profileEvidence,
    evidence: {
      structured: Boolean(
        structured.name
        || structured.organization
        || structured.sex
        || structured.birthDate
        || structured.breed
      ),
      labelled: Boolean(Object.keys(labelled).length),
    },
  };

  return {
    ...record,
    rawRecord: {
      ...object(record.rawRecord),
      _automationAdoptionNormalization: adoptionNormalization,
    },
    proposed,
    lifecycleSignals,
    extraction: record.extraction
      ? {
          ...record.extraction,
          evidenceMetadata: {
            ...record.extraction.evidenceMetadata,
            adoptionNormalization,
          },
        }
      : record.extraction,
  };
}

export function automationAdoptionNormalizationMetadata(record: AutomationSourceRecord) {
  const value = record.extraction?.evidenceMetadata?.adoptionNormalization
    ?? object(record.rawRecord)._automationAdoptionNormalization;
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
