import {
  canonicalizeSourceUrl,
  isSafeAutomationSourceUrl,
  normalizeAutomationIdentity,
  type AutomationLifecycleSignal,
  type AutomationSourceConfig,
  type AutomationSourceRecord,
} from "./data-automation.ts";

export const AUTOMATION_LOST_FOUND_NORMALIZATION_VERSION = 1 as const;

type LostFoundType = "LOST" | "FOUND";
type LostFoundSex = "MALE" | "FEMALE" | "UNKNOWN";
type LostFoundSize = "SMALL" | "MEDIUM" | "LARGE" | "UNKNOWN";

function clean(value: unknown, max = 5000) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).normalize("NFC").replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
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

function explicitTypeValue(value: unknown): LostFoundType | null {
  const normalized = normalizeAutomationIdentity(value);
  if (normalized === "lost") return "LOST";
  if (normalized === "found") return "FOUND";
  return null;
}

function textTypeEvidence(text: string) {
  const normalized = normalizeAutomationIdentity(text);
  const lost = /(?:^|\s)(?:strateny\s+pes|stratena\s+fenka|pes\s+sa\s+stratil|fenka\s+sa\s+stratila|nezvestny\s+pes|nezvestna\s+fenka)(?:\s|$)/.test(normalized);
  const found = /(?:^|\s)(?:najdeny\s+pes|najdena\s+fenka|pes\s+bol\s+najdeny|fenka\s+bola\s+najdena)(?:\s|$)/.test(normalized);
  return { lost, found };
}

function explicitSex(value: unknown): LostFoundSex | null {
  const normalized = normalizeAutomationIdentity(value);
  if (!normalized) return null;
  if (/^(?:male|samec|pes)$/.test(normalized)) return "MALE";
  if (/^(?:female|samica|fenka|sucka)$/.test(normalized)) return "FEMALE";
  if (/^(?:unknown|nezname|neznamy|neznam[aá]|neuvedene|neuvedeny|neuvedena)$/.test(normalized)) return "UNKNOWN";
  return null;
}

function explicitSize(value: unknown): LostFoundSize | null {
  const normalized = normalizeAutomationIdentity(value);
  if (!normalized) return null;
  if (/^(?:small|maly|mala|male)$/.test(normalized)) return "SMALL";
  if (/^(?:medium|stredny|stredna|stredne)$/.test(normalized)) return "MEDIUM";
  if (/^(?:large|velky|velka|velke)$/.test(normalized)) return "LARGE";
  if (/^(?:unknown|nezname|neznama|neznamy|neuvedene|neuvedena|neuvedeny)$/.test(normalized)) return "UNKNOWN";
  return null;
}

function explicitDogName(value: unknown) {
  const text = clean(value, 160);
  if (!text) return null;
  const normalized = normalizeAutomationIdentity(text);
  if (!normalized || /^(?:pes|fenka|sucka|samec|samica|meno|nezname|neuvedene)$/.test(normalized)) return null;
  return text;
}

function scrubEmailAndPhone(value: string) {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted]")
    .replace(/(?<!\d)(?:\+?421[\s.-]?)?(?:0?\d{2,3})[\s.-]?\d{3}[\s.-]?\d{3}(?!\d)/g, "[redacted]");
}

function contactLine(value: string) {
  const normalized = normalizeAutomationIdentity(value);
  return /^(?:kontakt|kontaktna\s+osoba|contact|telefon|tel|mobil|email|e\s+mail|kontaktna\s+adresa|adresa\s+kontaktu)\b/.test(normalized);
}

function sanitizePublicText(value: unknown, max = 5000) {
  const text = typeof value === "string" || typeof value === "number" ? String(value).normalize("NFC") : "";
  if (!text.trim()) return null;
  const lines = text
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !contactLine(line))
    .map(scrubEmailAndPhone);
  let sanitized = lines.join("\n");
  sanitized = sanitized.replace(
    /\b(?:kontakt(?:n[aá]\s+osoba)?|contact|telef[oó]n|tel\.?|mobil|e-?mail|kontaktn[aá]\s+adresa|adresa\s+kontaktu)\s*[:–—-]\s*.{1,120}?(?=(?:\s+(?:meno|pes|fenka|pohlavie|plemeno|rasa|farba|vek|ve[lľ]kos[tť]|d[aá]tum\s+(?:n[aá]lezu|straty|incidentu|udalosti)|mesto|okres|kraj|regi[oó]n|lokalita|miesto|stav|status|zdroj)\s*[:–—-])|$)/gi,
    " ",
  );
  sanitized = scrubEmailAndPhone(sanitized).replace(/\s+/g, " ").trim();
  return sanitized ? sanitized.slice(0, max) : null;
}

const RAW_SENSITIVE_KEYS = /^(?:phone|telephone|mobile|email|contact|contactname|contactperson|contactpoint|privateaddress|contactaddress|latitude|longitude|coordinates|geo|streetaddress|postalcode)$/i;

function sanitizeRawValue(value: unknown, depth = 0): unknown {
  if (depth > 5) return null;
  if (typeof value === "string") return sanitizePublicText(value, 10_000);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizeRawValue(item, depth + 1)).filter((item) => item !== undefined);
  if (!value || typeof value !== "object") return null;
  const output: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>).slice(0, 100)) {
    if (RAW_SENSITIVE_KEYS.test(key.replace(/[_-]/g, ""))) continue;
    const safe = sanitizeRawValue(raw, depth + 1);
    if (safe !== undefined) output[key] = safe;
  }
  return output;
}

function structuredFacts(rawRecord: unknown) {
  const raw = object(rawRecord);
  const structured = object(raw.structured);
  const address = object(structured.address);
  const location = object(structured.location);
  const locationAddress = object(location.address);
  return {
    type: explicitTypeValue(structured.type ?? structured.reportType ?? structured.incidentType),
    dogName: explicitDogName(structured.dogName ?? structured.dog_name),
    sex: explicitSex(structured.sex ?? structured.gender),
    breed: clean(structured.breed ?? structured.breedName, 300),
    color: clean(structured.color ?? structured.colour, 200),
    approximateAge: clean(structured.approximateAge ?? structured.ageNote ?? structured.age, 300),
    size: explicitSize(structured.size),
    description: sanitizePublicText(structured.description, 5000),
    eventDate: exactDate(structured.eventDate ?? structured.incidentDate ?? structured.dateLost ?? structured.dateFound),
    city: clean(structured.city ?? locationAddress.addressLocality ?? address.addressLocality, 200),
    district: clean(structured.district ?? locationAddress.addressSubregion ?? address.addressSubregion, 200),
    region: clean(structured.region ?? locationAddress.addressRegion ?? address.addressRegion, 200),
    locationDescription: clean(structured.locationDescription ?? structured.locationNote ?? location.name, 700),
    source: named(structured.source ?? structured.publisher),
    sourceUrl: safePublicUrl(structured.sourceUrl ?? structured.url),
    status: clean(structured.status, 300),
    resolved: structured.resolved === true || raw.resolvedSignal === true,
  };
}

function recordText(record: AutomationSourceRecord) {
  const raw = object(record.rawRecord);
  return [
    raw.pageTextExcerpt,
    raw.contentExcerpt,
    raw.detailText,
    raw.text,
    record.proposed.description,
  ]
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .join("\n")
    .slice(0, 30_000);
}

function labelledFacts(text: string) {
  const facts: Record<string, string> = {};
  const mappings: Array<[string, RegExp]> = [
    ["type", /^(?:typ|type)\s*[:–—-]\s*(.+)$/i],
    ["dogName", /^(?:meno|dog\s+name|pes|fenka)\s*[:–—-]\s*(.+)$/i],
    ["sex", /^(?:pohlavie|sex|gender)\s*[:–—-]\s*(.+)$/i],
    ["breed", /^(?:plemeno|rasa|breed)\s*[:–—-]\s*(.+)$/i],
    ["color", /^(?:farba|color|colour)\s*[:–—-]\s*(.+)$/i],
    ["approximateAge", /^(?:vek|pribli[zž]n[yý]\s+vek|age)\s*[:–—-]\s*(.+)$/i],
    ["size", /^(?:ve[lľ]kos[tť]|size)\s*[:–—-]\s*(.+)$/i],
    ["eventDate", /^(?:d[aá]tum\s+(?:n[aá]lezu|straty|incidentu|udalosti)|incident\s+date|date\s+(?:lost|found))\s*[:–—-]\s*(.+)$/i],
    ["city", /^(?:mesto|city)\s*[:–—-]\s*(.+)$/i],
    ["district", /^(?:okres|district)\s*[:–—-]\s*(.+)$/i],
    ["region", /^(?:kraj|regi[oó]n|region)\s*[:–—-]\s*(.+)$/i],
    ["locationDescription", /^(?:lokalita|miesto\s+(?:straty|n[aá]lezu)|location)\s*[:–—-]\s*(.+)$/i],
    ["source", /^(?:zdroj|source)\s*[:–—-]\s*(.+)$/i],
    ["sourceUrl", /^(?:zdroj\s+url|source\s+url|odkaz)\s*[:–—-]\s*(.+)$/i],
    ["status", /^(?:stav|status)\s*[:–—-]\s*(.+)$/i],
  ];
  const lines = text
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .map((line) => line.replace(/^\s*[-*#>]+\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 400);
  for (const line of lines) {
    if (contactLine(line)) continue;
    for (const [key, pattern] of mappings) {
      if (facts[key]) continue;
      const value = line.match(pattern)?.[1]?.trim();
      if (value) facts[key] = value.slice(0, 1000);
    }
  }

  const flat = text.replace(/\s+/g, " ").trim();
  const labels = "(?:typ|type|meno|dog\\s+name|pes|fenka|pohlavie|sex|gender|plemeno|rasa|breed|farba|color|colour|vek|pribli[zž]n[yý]\\s+vek|age|ve[lľ]kos[tť]|size|d[aá]tum\\s+(?:n[aá]lezu|straty|incidentu|udalosti)|incident\\s+date|date\\s+(?:lost|found)|mesto|city|okres|district|kraj|regi[oó]n|region|lokalita|miesto\\s+(?:straty|n[aá]lezu)|location|zdroj|source|zdroj\\s+url|source\\s+url|odkaz|stav|status|kontakt|telefon|tel|email|e-mail)";
  const flatMappings: Array<[string, string]> = [
    ["type", "(?:typ|type)"],
    ["dogName", "(?:meno|dog\\s+name|pes|fenka)"],
    ["sex", "(?:pohlavie|sex|gender)"],
    ["breed", "(?:plemeno|rasa|breed)"],
    ["color", "(?:farba|color|colour)"],
    ["approximateAge", "(?:vek|pribli[zž]n[yý]\\s+vek|age)"],
    ["size", "(?:ve[lľ]kos[tť]|size)"],
    ["eventDate", "(?:d[aá]tum\\s+(?:n[aá]lezu|straty|incidentu|udalosti)|incident\\s+date|date\\s+(?:lost|found))"],
    ["city", "(?:mesto|city)"],
    ["district", "(?:okres|district)"],
    ["region", "(?:kraj|regi[oó]n|region)"],
    ["locationDescription", "(?:lokalita|miesto\\s+(?:straty|n[aá]lezu)|location)"],
    ["source", "(?:zdroj|source)"],
    ["sourceUrl", "(?:zdroj\\s+url|source\\s+url|odkaz)"],
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

function incidentDateFromText(text: string) {
  const lines = text.replace(/\r/g, "\n").split(/\n+/).map((line) => line.trim()).filter(Boolean).slice(0, 400);
  for (const line of lines) {
    if (!/(?:stratil|stratila|straten|nezvestn|bol\s+n[aá]jden|bola\s+n[aá]jden|n[aá]jden[ýá]\s+(?:pes|fenka))/i.test(line)) continue;
    const match = line.match(/(?:d[nň]a\s*)?(\d{1,2}\.\s*\d{1,2}\.\s*\d{4}|\d{4}-\d{2}-\d{2})/i)?.[1];
    const parsed = exactDate(match);
    if (parsed) return parsed;
  }
  return null;
}

function explicitResolvedStatus(value: unknown) {
  const normalized = normalizeAutomationIdentity(value);
  if (!normalized) return null;
  if (/^(?:resolved|vyriesene|pripad\s+vyrieseny|majitel\s+najdeny|majitel\s+bol\s+dohladany|pes\s+vrateny\s+majitelovi|pes\s+je\s+doma|pes\s+sa\s+nasiel|pes\s+bol\s+odovzdany\s+majitelovi)$/.test(normalized)) {
    return true;
  }
  return null;
}

function explicitResolvedText(text: string) {
  const normalized = normalizeAutomationIdentity(text);
  if (!normalized) return false;
  const falsePositive = /(?:hlada\s+sa\s+majitel|kontaktujte\s+majitela|pomozte\s+najst\s+majitela|pes\s+sa\s+zatial\s+nenasiel|ak\s+sa\s+majitel\s+najde)/.test(normalized);
  if (falsePositive && !/(?:pripad\s+vyrieseny|pes\s+je\s+doma|pes\s+vrateny\s+majitelovi|pes\s+bol\s+odovzdany\s+majitelovi)/.test(normalized)) {
    return false;
  }
  return /(?:majitel\s+najdeny|majitel\s+bol\s+dohladany|pes\s+vrateny\s+majitelovi|pes\s+je\s+doma|pripad\s+vyrieseny|pes\s+sa\s+nasiel|pes\s+bol\s+odovzdany\s+majitelovi)/.test(normalized);
}

function sourceTypeEvidence(
  proposed: Record<string, unknown>,
  sourceConfig: AutomationSourceConfig | undefined,
  structured: ReturnType<typeof structuredFacts>,
  labelled: Record<string, string>,
  text: string,
) {
  const candidates: Array<{ type: LostFoundType; source: string }> = [];
  const push = (type: LostFoundType | null, source: string) => {
    if (type) candidates.push({ type, source });
  };
  push(explicitTypeValue(proposed.type), "RECORD");
  push(explicitTypeValue(sourceConfig?.staticFields?.type), "SOURCE_STATIC");
  push(structured.type, "STRUCTURED");
  push(explicitTypeValue(labelled.type), "LABELLED");
  const semantic = textTypeEvidence(text);
  if (semantic.lost) push("LOST", "TEXT");
  if (semantic.found) push("FOUND", "TEXT");
  const values = [...new Set(candidates.map((item) => item.type))];
  return {
    type: values.length === 1 ? values[0] : null,
    conflict: values.length > 1,
    sources: candidates.map((item) => item.source),
  };
}

export function normalizeAutomationLostFoundRecord(
  record: AutomationSourceRecord,
  options: { sourceConfig?: AutomationSourceConfig } = {},
): AutomationSourceRecord {
  const p = object(record.proposed);
  const structured = structuredFacts(record.rawRecord);
  const text = recordText(record);
  const labelled = labelledFacts(text);
  const typeEvidence = sourceTypeEvidence(p, options.sourceConfig, structured, labelled, text);

  const dateCandidates = [
    exactDate(p.eventDate ?? p.event_date),
    structured.eventDate,
    exactDate(labelled.eventDate),
    incidentDateFromText(text),
  ].filter((value): value is string => Boolean(value));
  const uniqueDates = [...new Set(dateCandidates)];
  const eventDate = uniqueDates.length === 1 ? uniqueDates[0] : null;

  const dogName = explicitDogName(p.dogName ?? p.dog_name)
    ?? structured.dogName
    ?? explicitDogName(labelled.dogName);
  const sex = explicitSex(p.sex) ?? structured.sex ?? explicitSex(labelled.sex);
  const breed = clean(p.breed ?? structured.breed ?? labelled.breed, 300);
  const color = clean(p.color ?? structured.color ?? labelled.color, 200);
  const approximateAge = clean(p.approximateAge ?? p.approximate_age ?? structured.approximateAge ?? labelled.approximateAge, 300);
  const size = explicitSize(p.size) ?? structured.size ?? explicitSize(labelled.size);

  const city = clean(p.city ?? structured.city ?? labelled.city, 200);
  const district = clean(p.district ?? structured.district ?? labelled.district, 200);
  const region = clean(p.region ?? structured.region ?? labelled.region, 200);
  const locationDescription = sanitizePublicText(
    p.locationDescription ?? p.location_description ?? structured.locationDescription ?? labelled.locationDescription,
    700,
  );

  const description = sanitizePublicText(p.description ?? structured.description, 5000);
  const source = sanitizePublicText(p.source ?? structured.source ?? labelled.source, 500);
  const sourceUrl = safePublicUrl(p.sourceUrl ?? p.source_url)
    ?? structured.sourceUrl
    ?? safePublicUrl(labelled.sourceUrl)
    ?? safePublicUrl(record.extraction?.itemUrl)
    ?? safePublicUrl(record.sourceUrl);

  const proposed: Record<string, unknown> = {};
  if (typeEvidence.type) proposed.type = typeEvidence.type;
  if (dogName) proposed.dogName = dogName;
  if (sex) proposed.sex = sex;
  if (breed) proposed.breed = breed;
  if (color) proposed.color = color;
  if (approximateAge) proposed.approximateAge = approximateAge;
  if (size) proposed.size = size;
  if (description) proposed.description = description;
  if (eventDate) proposed.eventDate = eventDate;
  if (region) proposed.region = region;
  if (district) proposed.district = district;
  if (city) proposed.city = city;
  if (locationDescription) proposed.locationDescription = locationDescription;
  if (source) proposed.source = source;
  if (sourceUrl) proposed.sourceUrl = sourceUrl;

  const explicitResolved = structured.resolved
    || explicitResolvedStatus(structured.status ?? labelled.status) === true
    || explicitResolvedText(text);
  const lifecycleSignals: AutomationLifecycleSignal[] = [...(record.lifecycleSignals ?? [])];
  if (explicitResolved && !lifecycleSignals.some((signal) => signal.signalType === "LOST_FOUND_RESOLVED")) {
    lifecycleSignals.push({
      signalType: "LOST_FOUND_RESOLVED",
      targetState: "RESOLVED",
      evidenceText: "Zdroj explicitne uvádza, že prípad bol vyriešený.",
      confidenceClass: "EXPLICIT",
    });
  }

  const localityFields = [
    city ? "city" : null,
    district ? "district" : null,
    region ? "region" : null,
    locationDescription ? "locationDescription" : null,
  ].filter((value): value is string => Boolean(value));
  const dogProfileFields = [
    dogName ? "dogName" : null,
    sex ? "sex" : null,
    breed ? "breed" : null,
    color ? "color" : null,
    approximateAge ? "approximateAge" : null,
    size ? "size" : null,
  ].filter((value): value is string => Boolean(value));

  const lostFoundNormalization = {
    version: AUTOMATION_LOST_FOUND_NORMALIZATION_VERSION,
    normalizedFields: Object.keys(proposed),
    explicitType: typeEvidence.type,
    typeEvidence: typeEvidence.sources,
    typeConflict: typeEvidence.conflict,
    incidentDateEvidence: eventDate ? true : false,
    incidentDateConflict: uniqueDates.length > 1,
    localityEvidence: localityFields,
    dogProfileEvidence: dogProfileFields.length > 0,
    dogProfileFields,
    explicitResolved,
    structuredEvidence: Boolean(
      structured.type
      || structured.dogName
      || structured.sex
      || structured.breed
      || structured.color
      || structured.eventDate
      || structured.city
      || structured.district
      || structured.region
    ),
    labelledEvidence: Object.keys(labelled).length > 0,
    contactDataRedacted: true,
  };

  const sanitizedRaw = object(sanitizeRawValue(record.rawRecord));
  sanitizedRaw._automationLostFoundNormalization = lostFoundNormalization;
  if (explicitResolved) {
    sanitizedRaw.resolvedSignal = true;
    sanitizedRaw.resolvedEvidence = "Explicit LOST_FOUND resolution evidence.";
  }

  return {
    ...record,
    rawRecord: sanitizedRaw,
    proposed,
    lifecycleSignals,
    extraction: record.extraction
      ? {
          ...record.extraction,
          evidenceMetadata: {
            ...record.extraction.evidenceMetadata,
            lostFoundNormalization,
          },
        }
      : record.extraction,
  };
}

export function automationLostFoundNormalizationMetadata(record: AutomationSourceRecord) {
  const value = record.extraction?.evidenceMetadata?.lostFoundNormalization
    ?? object(record.rawRecord)._automationLostFoundNormalization;
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
