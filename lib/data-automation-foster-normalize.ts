import {
  canonicalizeSourceUrl,
  isSafeAutomationSourceUrl,
  normalizeAutomationIdentity,
  type AutomationLifecycleSignal,
  type AutomationSourceConfig,
  type AutomationSourceRecord,
} from "./data-automation.ts";

export const AUTOMATION_FOSTER_NORMALIZATION_VERSION = 1 as const;

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

export function genericAutomationFosterTitle(value: unknown) {
  const normalized = normalizeAutomationIdentity(value);
  if (!normalized) return true;
  return /^(?:urgentne\s+)?(?:hladame|potrebujeme)\s+(?:docasku|docasnu\s+opateru|docasne\s+umiestnenie)(?:\s+pre\s+psa)?$/.test(normalized)
    || /^(?:docasna\s+opatera|hladame\s+docasku|potrebujeme\s+docasku|pomozte\s+nam\s+docasna\s+opatera)$/.test(normalized);
}

function explicitDogName(value: unknown) {
  const text = clean(value, 160);
  if (!text || genericAutomationFosterTitle(text)) return null;
  const normalized = normalizeAutomationIdentity(text);
  if (!normalized || /^(?:pes|psik|fenka|meno|nezname|neuvedene)$/.test(normalized)) return null;
  return text;
}

function explicitMoney(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  const text = clean(value, 120);
  if (!text) return null;
  const match = text.replace(/\u00a0/g, " ").match(/^(?:€\s*)?(\d{1,9}(?:[ .]\d{3})*(?:[,.]\d{1,2})?|\d{1,9}(?:[,.]\d{1,2})?)\s*(?:€|eur)?$/i);
  if (!match) return null;
  const normalized = match[1].replace(/\s+/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function structuredFacts(rawRecord: unknown) {
  const raw = object(rawRecord);
  const structured = object(raw.structured);
  const address = object(structured.address);
  const location = object(structured.location);
  const locationAddress = object(location.address);
  return {
    title: clean(structured.headline ?? structured.title ?? structured.name, 300),
    dogName: explicitDogName(structured.dogName ?? structured.dog_name),
    organization: named(structured.organization ?? structured.shelter ?? structured.provider),
    breed: clean(structured.breed ?? structured.breedName, 300),
    ageNote: clean(structured.ageNote ?? structured.age ?? structured.approximateAge, 300),
    city: clean(structured.city ?? locationAddress.addressLocality ?? address.addressLocality, 200),
    region: clean(structured.region ?? locationAddress.addressRegion ?? address.addressRegion, 200),
    locationNote: clean(structured.locationNote ?? structured.locationDescription, 700),
    reportedDate: exactDate(structured.reportedDate ?? structured.dateReported ?? structured.datePublished),
    deadlineDate: exactDate(structured.deadlineDate ?? structured.deadline),
    actionUrl: safePublicUrl(structured.actionUrl ?? structured.url),
    contactNote: clean(structured.contactNote ?? structured.contact, 1000),
    description: clean(structured.description, 5000),
    excerpt: clean(structured.excerpt ?? structured.shortDescription, 1000),
    goalAmount: explicitMoney(structured.goalAmount),
    raisedAmount: explicitMoney(structured.raisedAmount),
    status: clean(structured.status, 300),
    urgent: structured.urgent === true,
    resolved: structured.resolved === true,
  };
}

function fosterText(record: AutomationSourceRecord) {
  const raw = object(record.rawRecord);
  return [
    raw.pageTextExcerpt,
    raw.contentExcerpt,
    raw.detailText,
    raw.text,
    record.proposed.description,
    record.proposed.excerpt,
  ]
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .join("\n")
    .slice(0, 20_000);
}

function labelledFacts(text: string) {
  const facts: Record<string, string> = {};
  const mappings: Array<[string, RegExp]> = [
    ["dogName", /^(?:meno|ps[ií]k|pes|fenka|dog)\s*[:–—-]\s*(.+)$/i],
    ["organization", /^(?:organiz[aá]cia|[uú]tulok|oz|organization|shelter)\s*[:–—-]\s*(.+)$/i],
    ["breed", /^(?:plemeno|rasa|breed)\s*[:–—-]\s*(.+)$/i],
    ["ageNote", /^(?:vek|age)\s*[:–—-]\s*(.+)$/i],
    ["city", /^(?:mesto|city)\s*[:–—-]\s*(.+)$/i],
    ["region", /^(?:kraj|regi[oó]n|region)\s*[:–—-]\s*(.+)$/i],
    ["locationNote", /^(?:lokalita|miesto|location)\s*[:–—-]\s*(.+)$/i],
    ["reportedDate", /^(?:nahl[aá]sen[eé]|d[aá]tum\s+nahl[aá]senia|reported)\s*[:–—-]\s*(.+)$/i],
    ["deadlineDate", /^(?:term[ií]n|deadline|do\s+d[aá]tumu)\s*[:–—-]\s*(.+)$/i],
    ["actionUrl", /^(?:odkaz|link|action\s+url)\s*[:–—-]\s*(.+)$/i],
    ["contactNote", /^(?:kontakt|contact)\s*[:–—-]\s*(.+)$/i],
    ["urgent", /^(?:urgentn[eé]|urgent|s[uú]rne)\s*[:–—-]\s*(.+)$/i],
    ["status", /^(?:stav|status)\s*[:–—-]\s*(.+)$/i],
    ["goalAmount", /^(?:cie[lľ]|goal)\s*[:–—-]\s*(.+)$/i],
    ["raisedAmount", /^(?:vyzbieran[eé]|raised)\s*[:–—-]\s*(.+)$/i],
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
  const labels = "(?:meno|ps[ií]k|pes|fenka|dog|organiz[aá]cia|[uú]tulok|oz|organization|shelter|plemeno|rasa|breed|vek|age|mesto|city|kraj|regi[oó]n|region|lokalita|miesto|location|nahl[aá]sen[eé]|d[aá]tum\\s+nahl[aá]senia|reported|term[ií]n|deadline|do\\s+d[aá]tumu|odkaz|link|action\\s+url|kontakt|contact|urgentn[eé]|urgent|s[uú]rne|stav|status|cie[lľ]|goal|vyzbieran[eé]|raised)";
  const flatMappings: Array<[string, string]> = [
    ["dogName", "(?:meno|ps[ií]k|pes|fenka|dog)"],
    ["organization", "(?:organiz[aá]cia|[uú]tulok|oz|organization|shelter)"],
    ["breed", "(?:plemeno|rasa|breed)"],
    ["ageNote", "(?:vek|age)"],
    ["city", "(?:mesto|city)"],
    ["region", "(?:kraj|regi[oó]n|region)"],
    ["locationNote", "(?:lokalita|miesto|location)"],
    ["reportedDate", "(?:nahl[aá]sen[eé]|d[aá]tum\\s+nahl[aá]senia|reported)"],
    ["deadlineDate", "(?:term[ií]n|deadline|do\\s+d[aá]tumu)"],
    ["actionUrl", "(?:odkaz|link|action\\s+url)"],
    ["contactNote", "(?:kontakt|contact)"],
    ["urgent", "(?:urgentn[eé]|urgent|s[uú]rne)"],
    ["status", "(?:stav|status)"],
    ["goalAmount", "(?:cie[lľ]|goal)"],
    ["raisedAmount", "(?:vyzbieran[eé]|raised)"],
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

function explicitYes(value: unknown) {
  const normalized = normalizeAutomationIdentity(value);
  return /^(?:ano|yes|true|1)$/.test(normalized);
}

function explicitUrgencyLine(text: string) {
  const lines = text.replace(/\r/g, "\n").split(/\n+/)
    .map((line) => normalizeAutomationIdentity(line.replace(/^\s*[-*#>]+\s*/, "")))
    .filter(Boolean)
    .slice(0, 300);
  return lines.some((line) => /^(?:urgentne|urgentna pomoc|surne|okamzite hladame)(?:\b|\s)/.test(line));
}

function explicitResolvedStatus(value: unknown) {
  const normalized = normalizeAutomationIdentity(value);
  if (!normalized) return null;
  if (/^(?:vyriesene|vybavene|docaska zabezpecena|docasna opatera zabezpecena|nasiel docasnu opateru|nasla docasnu opateru|uz nepotrebuje docasnu opateru|adoptovany|adoptovana|adopted)$/.test(normalized)) {
    return { signalType: "FOSTER_RESOLVED" as const, targetState: "RESOLVED", evidenceText: clean(value, 240)! };
  }
  return null;
}

function explicitResolvedLine(text: string) {
  const lines = text
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .map((line) => line.replace(/^\s*[-*#>]+\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 300);
  for (const line of lines) {
    const direct = explicitResolvedStatus(line);
    if (direct) return direct;
    const labelled = line.match(/^(?:stav|status)\s*[:–—-]\s*(.+)$/i)?.[1];
    const signal = explicitResolvedStatus(labelled);
    if (signal) return signal;
  }
  return null;
}

function explicitResolvedFlatText(text: string) {
  const normalized = normalizeAutomationIdentity(text);
  const match = normalized.match(
    /(?:^|\s)(?:stav|status)\s+(vyriesene|vybavene|docaska zabezpecena|docasna opatera zabezpecena|nasiel docasnu opateru|nasla docasnu opateru|uz nepotrebuje docasnu opateru|adoptovany|adoptovana|adopted)(?:\s|$)/,
  );
  if (!match) return null;
  return {
    signalType: "FOSTER_RESOLVED" as const,
    targetState: "RESOLVED",
    evidenceText: match[1],
  };
}

export function normalizeAutomationFosterRecord(
  record: AutomationSourceRecord,
  options: { sourceConfig?: AutomationSourceConfig } = {},
): AutomationSourceRecord {
  const p = { ...record.proposed };
  const structured = structuredFacts(record.rawRecord);
  const text = fosterText(record);
  const labelled = labelledFacts(text);
  const sourceOrganization = clean(options.sourceConfig?.staticFields?.organizationName, 500);

  const proposed: Record<string, unknown> = { ...p };
  delete proposed.name;
  delete proposed.organizationName;

  const dogName = explicitDogName(p.dogName) ?? structured.dogName ?? explicitDogName(labelled.dogName);
  if (dogName) proposed.dogName = dogName;
  else delete proposed.dogName;

  const sourceTitle = clean(p.title ?? structured.title, 300);
  const concreteTitle = sourceTitle && !genericAutomationFosterTitle(sourceTitle) ? sourceTitle : null;
  if (concreteTitle) proposed.title = concreteTitle;
  else if (dogName) proposed.title = dogName;
  else delete proposed.title;

  const explicitOrganization = clean(p.organization ?? p.organizationName, 500);
  const organization = explicitOrganization
    ?? structured.organization
    ?? clean(labelled.organization, 500)
    ?? sourceOrganization;
  if (organization) proposed.organization = organization;
  else delete proposed.organization;

  const excerpt = clean(p.excerpt ?? structured.excerpt, 1000);
  const description = clean(p.description, 5000) ?? structured.description;
  if (excerpt) proposed.excerpt = excerpt;
  if (description) proposed.description = description;

  const breed = clean(p.breed ?? structured.breed ?? labelled.breed, 300);
  const ageNote = clean(p.ageNote ?? p.age_note ?? structured.ageNote ?? labelled.ageNote, 300);
  const city = clean(p.city ?? structured.city ?? labelled.city, 200);
  const region = clean(p.region ?? structured.region ?? labelled.region, 200);
  const locationNote = clean(p.locationNote ?? p.location_note ?? structured.locationNote ?? labelled.locationNote, 700);
  if (breed) proposed.breed = breed;
  if (ageNote) proposed.ageNote = ageNote;
  if (city) proposed.city = city;
  if (region) proposed.region = region;
  if (locationNote) proposed.locationNote = locationNote;

  const reportedDate = exactDate(p.reportedDate ?? p.reported_date)
    ?? structured.reportedDate
    ?? exactDate(labelled.reportedDate);
  const deadlineDate = exactDate(p.deadlineDate ?? p.deadline_date)
    ?? structured.deadlineDate
    ?? exactDate(labelled.deadlineDate);
  if (reportedDate) proposed.reportedDate = reportedDate;
  else {
    delete proposed.reportedDate;
    delete proposed.reported_date;
  }
  if (deadlineDate) proposed.deadlineDate = deadlineDate;
  else {
    delete proposed.deadlineDate;
    delete proposed.deadline_date;
  }

  const actionUrl = safePublicUrl(p.actionUrl ?? p.action_url)
    ?? structured.actionUrl
    ?? safePublicUrl(labelled.actionUrl)
    ?? safePublicUrl(record.extraction?.itemUrl)
    ?? safePublicUrl(record.sourceUrl);
  if (actionUrl) proposed.actionUrl = actionUrl;
  else {
    delete proposed.actionUrl;
    delete proposed.action_url;
  }

  const contactNote = clean(p.contactNote ?? p.contact_note ?? structured.contactNote ?? labelled.contactNote, 1000);
  if (contactNote) proposed.contactNote = contactNote;

  const goalAmount = explicitMoney(p.goalAmount ?? p.goal_amount)
    ?? structured.goalAmount
    ?? explicitMoney(labelled.goalAmount);
  const raisedAmount = explicitMoney(p.raisedAmount ?? p.raised_amount)
    ?? structured.raisedAmount
    ?? explicitMoney(labelled.raisedAmount);
  if (goalAmount !== null) proposed.goalAmount = goalAmount;
  else {
    delete proposed.goalAmount;
    delete proposed.goal_amount;
  }
  if (raisedAmount !== null) proposed.raisedAmount = raisedAmount;
  else {
    delete proposed.raisedAmount;
    delete proposed.raised_amount;
  }

  const urgent = p.urgent === true || structured.urgent || explicitYes(labelled.urgent) || explicitUrgencyLine(text);
  if (urgent) proposed.urgent = true;
  else delete proposed.urgent;

  // Source approval never implies public-case verification.
  if (p.verified === true && !record.extraction) proposed.verified = true;
  else delete proposed.verified;

  const lifecycle = p.resolved === true
    ? { signalType: "FOSTER_RESOLVED" as const, targetState: "RESOLVED", evidenceText: "resolved=true" }
    : structured.resolved
      ? { signalType: "FOSTER_RESOLVED" as const, targetState: "RESOLVED", evidenceText: "resolved=true" }
      : explicitResolvedStatus(structured.status ?? labelled.status)
        ?? explicitResolvedLine(text)
        ?? explicitResolvedFlatText(text);
  const lifecycleSignals: AutomationLifecycleSignal[] = [...(record.lifecycleSignals ?? [])];
  if (lifecycle && !lifecycleSignals.some((signal) => signal.signalType === lifecycle.signalType)) {
    lifecycleSignals.push({
      signalType: lifecycle.signalType,
      targetState: lifecycle.targetState,
      evidenceText: lifecycle.evidenceText,
      confidenceClass: "EXPLICIT",
    });
  }
  if (lifecycle) proposed.resolved = true;
  else delete proposed.resolved;

  const fosterProfileEvidence = Boolean(
    breed
    || ageNote
    || city
    || region
    || locationNote
    || reportedDate
    || deadlineDate
    || contactNote
    || urgent
    || goalAmount !== null
    || raisedAmount !== null
  );

  const fosterNormalization = {
    version: AUTOMATION_FOSTER_NORMALIZATION_VERSION,
    normalizedFields: Object.keys(proposed)
      .filter((key) => proposed[key] !== undefined && proposed[key] !== null && proposed[key] !== ""),
    organizationSource: explicitOrganization
      ? "RECORD"
      : structured.organization
        ? "STRUCTURED"
        : clean(labelled.organization, 500)
          ? "LABELLED"
          : sourceOrganization
            ? "SOURCE_STATIC"
            : null,
    concreteCaseEvidence: Boolean(dogName || concreteTitle),
    genericTitleRejected: Boolean(sourceTitle && !concreteTitle),
    explicitResolved: Boolean(lifecycle),
    fosterProfileEvidence,
    evidence: {
      structured: Boolean(
        structured.dogName
        || structured.organization
        || structured.breed
        || structured.ageNote
        || structured.city
        || structured.region
      ),
      labelled: Boolean(Object.keys(labelled).length),
    },
  };

  return {
    ...record,
    rawRecord: {
      ...object(record.rawRecord),
      _automationFosterNormalization: fosterNormalization,
    },
    proposed,
    lifecycleSignals,
    extraction: record.extraction
      ? {
          ...record.extraction,
          evidenceMetadata: {
            ...record.extraction.evidenceMetadata,
            fosterNormalization,
          },
        }
      : record.extraction,
  };
}

export function automationFosterNormalizationMetadata(record: AutomationSourceRecord) {
  const value = record.extraction?.evidenceMetadata?.fosterNormalization
    ?? object(record.rawRecord)._automationFosterNormalization;
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
