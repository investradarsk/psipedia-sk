import {
  canonicalizeSourceUrl,
  isSafeAutomationSourceUrl,
  normalizeAutomationIdentity,
  type AutomationLifecycleSignal,
  type AutomationSourceRecord,
} from "./data-automation.ts";
import { bratislavaDateKey, eventTypes, type EventType } from "./events.ts";

export const AUTOMATION_EVENT_NORMALIZATION_VERSION = 1 as const;
const ARCHIVE_GRACE_DAYS = 30;

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

function validDateParts(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null;
  return String(year) + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
}

function isoDateTime(value: unknown) {
  const text = clean(value, 120);
  if (!text) return null;
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{1,2}):(\d{2})(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)?$/);
  if (!match) return null;
  const date = validDateParts(Number(match[1]), Number(match[2]), Number(match[3]));
  if (!date) return null;
  const hour = match[4] === undefined ? null : Number(match[4]);
  const minute = match[5] === undefined ? null : Number(match[5]);
  const time = hour !== null && minute !== null && hour <= 23 && minute <= 59
    ? String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0")
    : null;
  return { date, time };
}

export function parseAutomationEventDateRange(value: unknown) {
  const text = clean(value, 180);
  if (!text) return null;
  const iso = isoDateTime(text);
  if (iso) return { startDate: iso.date, endDate: null as string | null, startTime: iso.time, endTime: null as string | null };

  const exact = text.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  if (exact) {
    const date = validDateParts(Number(exact[3]), Number(exact[2]), Number(exact[1]));
    return date ? { startDate: date, endDate: null, startTime: null, endTime: null } : null;
  }

  const sameMonth = text.match(/^(\d{1,2})\.\s*[–—-]\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  if (sameMonth) {
    const startDate = validDateParts(Number(sameMonth[4]), Number(sameMonth[3]), Number(sameMonth[1]));
    const endDate = validDateParts(Number(sameMonth[4]), Number(sameMonth[3]), Number(sameMonth[2]));
    if (!startDate || !endDate || endDate < startDate) return null;
    return { startDate, endDate, startTime: null, endTime: null };
  }

  const fullRange = text.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\s*[–—-]\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  if (fullRange) {
    const startDate = validDateParts(Number(fullRange[3]), Number(fullRange[2]), Number(fullRange[1]));
    const endDate = validDateParts(Number(fullRange[6]), Number(fullRange[5]), Number(fullRange[4]));
    if (!startDate || !endDate || endDate < startDate) return null;
    return { startDate, endDate, startTime: null, endTime: null };
  }

  const compactCrossMonth = text.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*[–—-]\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  if (compactCrossMonth) {
    const year = Number(compactCrossMonth[5]);
    const startDate = validDateParts(year, Number(compactCrossMonth[2]), Number(compactCrossMonth[1]));
    const endDate = validDateParts(year, Number(compactCrossMonth[4]), Number(compactCrossMonth[3]));
    if (!startDate || !endDate || endDate < startDate) return null;
    return { startDate, endDate, startTime: null, endTime: null };
  }

  return null;
}

function time(value: unknown) {
  const text = clean(value, 40);
  const match = text?.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0");
}

function safePublicUrl(value: unknown) {
  const url = canonicalizeSourceUrl(value);
  return url && isSafeAutomationSourceUrl(url) ? url : null;
}

function markdownOrBareUrl(value: string) {
  const markdown = value.match(/\]\((https:\/\/[^\s)]+)\)/i)?.[1];
  const bare = value.match(/https:\/\/[^\s)\]}>]+/i)?.[0];
  return safePublicUrl(markdown ?? bare);
}

function structuredFacts(rawRecord: unknown) {
  const raw = object(rawRecord);
  const structured = object(raw.structured);
  const location = object(structured.location);
  const address = object(location.address ?? structured.address);
  const offers = Array.isArray(structured.offers) ? object(structured.offers[0]) : object(structured.offers);
  const start = isoDateTime(structured.startDate);
  const end = isoDateTime(structured.endDate);
  const status = clean(structured.eventStatus ?? structured.status, 300);
  return {
    title: clean(structured.name ?? structured.headline, 500),
    startDate: start?.date ?? null,
    startTime: start?.time ?? null,
    endDate: end?.date ?? null,
    endTime: end?.time ?? null,
    venue: named(structured.location),
    city: clean(address.addressLocality, 200),
    region: clean(address.addressRegion, 200),
    address: [
      clean(address.streetAddress, 300),
      clean(address.postalCode, 40),
      clean(address.addressLocality, 200),
    ].filter(Boolean).join(", ") || null,
    organizer: named(structured.organizer),
    registrationUrl: safePublicUrl(offers.url),
    websiteUrl: safePublicUrl(structured.url),
    status,
  };
}

function eventText(record: AutomationSourceRecord) {
  const raw = object(record.rawRecord);
  const values = [
    raw.pageTextExcerpt,
    raw.contentExcerpt,
    raw.dateText,
    raw.place,
    raw.venue,
    raw.organizer,
    record.proposed.description,
    record.proposed.practicalInfo,
    record.proposed.excerpt,
  ].filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
  return values.join("\n").slice(0, 20_000);
}

function labelledFacts(text: string) {
  const facts: Record<string, string> = {};
  const lines = text
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .map((line) => line.replace(/^\s*[-*#>]+\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 250);

  const mappings: Array<[string, RegExp]> = [
    ["date", /^(?:dátum|datum|termín|termin|kedy)\s*[:–—-]\s*(.+)$/i],
    ["venue", /^(?:miesto(?:\s+konania)?|lokalita)\s*[:–—-]\s*(.+)$/i],
    ["organizer", /^(?:organizátor|organizator|usporiadateľ|usporiadatel)\s*[:–—-]\s*(.+)$/i],
    ["registration", /^(?:registrácia|registracia|prihlásenie|prihlasenie|prihláška|prihlaska)\s*[:–—-]\s*(.+)$/i],
    ["propositions", /^(?:propozície|propozicie)\s*[:–—-]\s*(.+)$/i],
    ["results", /^(?:výsledky|vysledky)\s*[:–—-]\s*(.+)$/i],
    ["time", /^(?:čas|cas|začiatok|zaciatok)\s*[:–—-]\s*(.+)$/i],
    ["type", /^(?:typ|druh\s+podujatia)\s*[:–—-]\s*(.+)$/i],
  ];
  for (const line of lines) {
    for (const [key, pattern] of mappings) {
      if (facts[key]) continue;
      const value = line.match(pattern)?.[1]?.trim();
      if (value) facts[key] = value.slice(0, 1000);
    }
  }

  const flat = text.replace(/\s+/g, " ").trim();
  const nextLabel = "(?:dátum|datum|termín|termin|kedy|miesto(?:\\s+konania)?|lokalita|organizátor|organizator|usporiadateľ|usporiadatel|registrácia|registracia|prihlásenie|prihlasenie|prihláška|prihlaska|propozície|propozicie|výsledky|vysledky|čas|cas|začiatok|zaciatok|typ|druh\\s+podujatia)";
  const flatMappings: Array<[string, string]> = [
    ["date", "(?:dátum|datum|termín|termin|kedy)"],
    ["venue", "(?:miesto(?:\\s+konania)?|lokalita)"],
    ["organizer", "(?:organizátor|organizator|usporiadateľ|usporiadatel)"],
    ["registration", "(?:registrácia|registracia|prihlásenie|prihlasenie|prihláška|prihlaska)"],
    ["propositions", "(?:propozície|propozicie)"],
    ["results", "(?:výsledky|vysledky)"],
    ["time", "(?:čas|cas|začiatok|zaciatok)"],
    ["type", "(?:typ|druh\\s+podujatia)"],
  ];
  for (const [key, label] of flatMappings) {
    if (facts[key]) continue;
    const pattern = new RegExp(
      "(?:^|\\s)" + label + "\\s*[:–—-]\\s*(.{1,1000}?)(?=\\s+" + nextLabel + "\\s*[:–—-]|$)",
      "i",
    );
    const value = flat.match(pattern)?.[1]?.trim();
    if (value) facts[key] = value.slice(0, 1000);
  }
  return facts;
}

function explicitEventType(value: unknown): EventType | null {
  const normalized = normalizeAutomationIdentity(value);
  const direct = (eventTypes as readonly string[]).find((type) => normalizeAutomationIdentity(type) === normalized);
  if (direct) return direct as EventType;
  const aliases: Record<string, EventType> = {
    vystava: "Výstava",
    vystavy: "Výstava",
    pretek: "Preteky",
    preteky: "Preteky",
    seminar: "Seminár",
    trening: "Tréning",
    stretnutie: "Stretnutie",
  };
  return aliases[normalized] ?? null;
}

function explicitCancellation(record: AutomationSourceRecord, status: string | null, text: string) {
  if (record.proposed.cancelled === true) return "Zdroj explicitne označil podujatie ako zrušené.";
  const normalizedStatus = normalizeAutomationIdentity(status);
  if (/(?:^| )eventcancelled(?: |$)|(?:^| )cancelled(?: |$)|(?:^| )canceled(?: |$)/.test(normalizedStatus)) {
    return status ?? "Cancelled";
  }
  const match = text.match(/(?:^|[\s:;,.!?–—-])(?:zrušené|zrušená|zrušený|podujatie\s+sa\s+ruší|akcia\s+sa\s+ruší|cancelled|canceled)(?=$|[\s:;,.!?–—-])/i);
  return match?.[0]?.trim() ?? null;
}

function conservativeCityFromVenue(value: string | null) {
  if (!value) return null;
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  const candidate = parts.length > 1 ? parts.at(-1)! : value.trim();
  if (!candidate || candidate.length > 80 || /\d|https?:|@/.test(candidate)) return null;
  return candidate;
}

function dateKeyDaysAgo(now: Date, days: number) {
  return bratislavaDateKey(new Date(now.getTime() - days * 86_400_000));
}

export function normalizeAutomationEventRecord(
  record: AutomationSourceRecord,
  options: { now?: Date } = {},
): AutomationSourceRecord {
  const p = { ...record.proposed };
  const structured = structuredFacts(record.rawRecord);
  const text = eventText(record);
  const labelled = labelledFacts(text);

  const proposedStart = isoDateTime(p.startDate ?? p.start_date);
  const raw = object(record.rawRecord);
  const labelledRange = parseAutomationEventDateRange(labelled.date);
  const rawDateRange = parseAutomationEventDateRange(raw.dateText);
  const startDate = proposedStart?.date
    ?? structured.startDate
    ?? labelledRange?.startDate
    ?? rawDateRange?.startDate
    ?? null;
  const startTime = time(p.startTime ?? p.start_time)
    ?? proposedStart?.time
    ?? structured.startTime
    ?? time(labelled.time);
  const proposedEnd = isoDateTime(p.endDate ?? p.end_date);
  const endDate = proposedEnd?.date
    ?? structured.endDate
    ?? labelledRange?.endDate
    ?? rawDateRange?.endDate
    ?? null;
  const endTime = time(p.endTime ?? p.end_time)
    ?? proposedEnd?.time
    ?? structured.endTime
    ?? null;

  const venue = clean(p.venue ?? p.location, 500)
    ?? structured.venue
    ?? clean(labelled.venue, 500);
  const organizer = clean(p.organizer ?? p.organization ?? p.organizationName, 500)
    ?? structured.organizer
    ?? clean(labelled.organizer, 500);
  const city = clean(p.city, 200)
    ?? structured.city
    ?? conservativeCityFromVenue(venue);
  const title = clean(p.title ?? p.name, 500) ?? structured.title;
  const websiteUrl = safePublicUrl(p.websiteUrl ?? p.website_url)
    ?? structured.websiteUrl
    ?? safePublicUrl(record.sourceUrl);
  const registrationUrl = safePublicUrl(p.registrationUrl ?? p.registration_url)
    ?? structured.registrationUrl
    ?? (labelled.registration ? markdownOrBareUrl(labelled.registration) : null);
  const propositionsUrl = safePublicUrl(p.propositionsUrl ?? p.propositions_url)
    ?? (labelled.propositions ? markdownOrBareUrl(labelled.propositions) : null);
  const resultsUrl = safePublicUrl(p.resultsUrl ?? p.results_url)
    ?? (labelled.results ? markdownOrBareUrl(labelled.results) : null);
  const eventType = explicitEventType(p.eventType ?? p.event_type)
    ?? explicitEventType(labelled.type);
  const cancellation = explicitCancellation(record, structured.status, text);

  const proposed: Record<string, unknown> = { ...p };
  if (title) proposed.title = title;
  if (startDate) proposed.startDate = startDate;
  if (startTime) proposed.startTime = startTime;
  if (endDate) proposed.endDate = endDate;
  if (endTime) proposed.endTime = endTime;
  if (venue) proposed.venue = venue;
  if (city) proposed.city = city;
  if (structured.region && !clean(p.region)) proposed.region = structured.region;
  if (structured.address && !clean(p.address)) proposed.address = structured.address;
  if (organizer) proposed.organizer = organizer;
  if (websiteUrl) proposed.websiteUrl = websiteUrl;
  if (registrationUrl) proposed.registrationUrl = registrationUrl;
  if (eventType) proposed.eventType = eventType;
  if (cancellation) proposed.cancelled = true;

  const lifecycleSignals: AutomationLifecycleSignal[] = [...(record.lifecycleSignals ?? [])];
  if (cancellation && !lifecycleSignals.some((signal) => signal.signalType === "EVENT_CANCELLED")) {
    lifecycleSignals.push({
      signalType: "EVENT_CANCELLED",
      targetState: "CANCELLED",
      evidenceText: cancellation.slice(0, 240),
      confidenceClass: "EXPLICIT",
    });
  }

  const now = options.now ?? new Date();
  const terminalDate = endDate ?? startDate;
  const archiveOnly = Boolean(terminalDate && terminalDate < dateKeyDaysAgo(now, ARCHIVE_GRACE_DAYS));
  const normalizedFields = Object.keys(proposed)
    .filter((key) => proposed[key] !== undefined && proposed[key] !== null && proposed[key] !== "");

  const eventNormalization = {
    version: AUTOMATION_EVENT_NORMALIZATION_VERSION,
    normalizedFields,
    explicitCancellation: Boolean(cancellation),
    archiveOnly,
    evidence: {
      structured: Boolean(structured.startDate || structured.organizer || structured.venue),
      labelled: Boolean(Object.keys(labelled).length),
    },
    evidenceLinks: {
      propositionsUrl,
      resultsUrl,
    },
  };

  return {
    ...record,
    rawRecord: {
      ...object(record.rawRecord),
      _automationEventNormalization: eventNormalization,
    },
    proposed,
    lifecycleSignals,
    extraction: record.extraction
      ? {
          ...record.extraction,
          evidenceMetadata: {
            ...record.extraction.evidenceMetadata,
            eventNormalization,
          },
        }
      : record.extraction,
  };
}

export function automationEventNormalizationMetadata(record: AutomationSourceRecord) {
  const value = record.extraction?.evidenceMetadata?.eventNormalization
    ?? object(record.rawRecord)._automationEventNormalization;
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
