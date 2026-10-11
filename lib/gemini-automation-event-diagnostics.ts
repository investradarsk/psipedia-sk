import { bratislavaDateKey } from "./events.ts";
import {
  publicEventUrl, strictEventDate, strictEventTime, validBratislavaWallClock,
  type GeminiEventRequestV1,
} from "./gemini-automation-event-contract.ts";

/**
 * Read-only, best-effort explanation of an Event parser rejection.
 * The authoritative parser runs first; this classifier can never accept a candidate.
 * Diagnostics contain only fixed codes, fixed field identifiers and a bounded index.
 */
const CANDIDATE_FIELDS = [
  "title","organizer","start_date","start_time","end_date","end_time","all_day",
  "venue","city","region","online","event_url","registration_url","description",
  "source_urls","evidence","cancelled",
] as const;
const REQUIRED_FIELDS = [
  "title","organizer","start_date","all_day","online","description",
  "source_urls","evidence","cancelled",
] as const;
const ENVELOPE_FIELDS = ["schema_version","category_key","candidates"] as const;
const EVIDENCE_FIELDS = [
  "title","organizer","start_date","city","venue","online","event_url",
  "registration_url","description","cancelled",
] as const;
const EVIDENCE_KEYS = ["source_url","fields"] as const;

export type EventValidationFailure =
  | "ENVELOPE_OR_CATEGORY" | "REQUIRED_KEY_MISSING" | "UNKNOWN_KEY"
  | "FIELD_TYPE_OR_VALUE" | "DATE_TIME_OR_DST" | "FIELD_COMBINATION"
  | "OFFLINE_LOCATION_MISSING" | "URL_INVALID_OR_FORBIDDEN"
  | "EVIDENCE_INVALID" | "HISTORICAL_OR_CANCELLED" | "UNCLASSIFIED";
type SafeEventField = typeof CANDIDATE_FIELDS[number] | typeof ENVELOPE_FIELDS[number] | typeof EVIDENCE_KEYS[number];
export type SafeEventValidationDiagnostic = {
  schemaFailure: EventValidationFailure;
  schemaField?: SafeEventField;
  candidateIndex?: number;
};

function diagnostic(schemaFailure: EventValidationFailure, schemaField?: SafeEventField,
  candidateIndex?: number): SafeEventValidationDiagnostic {
  return { schemaFailure, ...(schemaField === undefined ? {} : { schemaField }),
    ...(candidateIndex === undefined ? {} : { candidateIndex }) };
}
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function invalidBy(validator: () => unknown): boolean {
  try { validator(); return false; } catch { return true; }
}
function badString(value: unknown, max: number, nullable = false): boolean {
  if (nullable && value === null) return false;
  return typeof value !== "string" || !value.trim() || value.length > max;
}
function badDate(value: unknown): boolean {
  return invalidBy(() => strictEventDate(value));
}
function badTime(value: unknown): boolean {
  return invalidBy(() => strictEventTime(value));
}
function badUrl(value: unknown, nullable = false): boolean {
  return invalidBy(() => publicEventUrl(value, nullable));
}

/** Called exclusively after parseGeminiEventEnvelope rejected with INVALID_RESPONSE. */
export function classifyGeminiEventValidationFailure(
  raw: unknown, request: GeminiEventRequestV1, today = bratislavaDateKey(),
): SafeEventValidationDiagnostic {
  try {
    const envelope = object(raw);
    if (!envelope || Object.keys(envelope).some(k => !ENVELOPE_FIELDS.includes(k as typeof ENVELOPE_FIELDS[number])) ||
      ENVELOPE_FIELDS.some(k => !Object.hasOwn(envelope,k))) return diagnostic("ENVELOPE_OR_CATEGORY");
    if (envelope.schema_version !== 1) return diagnostic("ENVELOPE_OR_CATEGORY","schema_version");
    if (envelope.category_key !== request.stableKey) return diagnostic("ENVELOPE_OR_CATEGORY","category_key");
    if (!Array.isArray(envelope.candidates) || envelope.candidates.length > request.maxCandidates)
      return diagnostic("ENVELOPE_OR_CATEGORY","candidates");

    for (let index = 0; index < envelope.candidates.length; index++) {
      // Request's maxCandidates is server-bounded at <= 5.
      if (index >= 5) return diagnostic("ENVELOPE_OR_CATEGORY","candidates");
      const candidate = object(envelope.candidates[index]);
      const fail = (kind: EventValidationFailure, field?: SafeEventField) => diagnostic(kind,field,index);
      if (!candidate) return fail("FIELD_TYPE_OR_VALUE");
      if (Object.keys(candidate).some(k => !CANDIDATE_FIELDS.includes(k as typeof CANDIDATE_FIELDS[number])))
        return fail("UNKNOWN_KEY");
      for (const key of REQUIRED_FIELDS) {
        if (!Object.hasOwn(candidate,key)) return fail("REQUIRED_KEY_MISSING",key);
      }
      const v: Record<string,unknown> = {...candidate};
      // Mirror #726's nullable boundary only for diagnosis; do not infer factual values.
      for (const key of CANDIDATE_FIELDS) {
        if (!Object.hasOwn(v,key)) v[key] = null;
      }

      for (const [field,max] of [["title",160],["organizer",160]] as const) {
        if (badString(v[field],max)) return fail("FIELD_TYPE_OR_VALUE",field);
      }
      if (typeof v.start_date !== "string") return fail("FIELD_TYPE_OR_VALUE","start_date");
      if (badDate(v.start_date)) return fail("DATE_TIME_OR_DST","start_date");
      if (v.start_time !== null && typeof v.start_time !== "string") return fail("FIELD_TYPE_OR_VALUE","start_time");
      if (badTime(v.start_time)) return fail("DATE_TIME_OR_DST","start_time");
      if (v.end_date !== null && typeof v.end_date !== "string") return fail("FIELD_TYPE_OR_VALUE","end_date");
      if (v.end_date !== null && badDate(v.end_date)) return fail("DATE_TIME_OR_DST","end_date");
      if (v.end_time !== null && typeof v.end_time !== "string") return fail("FIELD_TYPE_OR_VALUE","end_time");
      if (badTime(v.end_time)) return fail("DATE_TIME_OR_DST","end_time");
      for (const field of ["all_day","online","cancelled"] as const) {
        if (typeof v[field] !== "boolean") return fail("FIELD_TYPE_OR_VALUE",field);
      }
      for (const [field,max] of [["venue",200],["city",120],["region",100]] as const) {
        if (badString(v[field],max,true)) return fail("FIELD_TYPE_OR_VALUE",field);
      }
      for (const field of ["event_url","registration_url"] as const) {
        if (badUrl(v[field],true)) return fail("URL_INVALID_OR_FORBIDDEN",field);
      }
      if (badString(v.description,3000) || (v.description as string).trim().length < 30)
        return fail("FIELD_TYPE_OR_VALUE","description");
      const start_date = v.start_date as string;
      const end_date = v.end_date as string | null;
      const start_time = v.start_time as string | null;
      const end_time = v.end_time as string | null;
      if (!v.online && !v.city) return fail("OFFLINE_LOCATION_MISSING","city");
      if (v.all_day && (start_time || end_time)) return fail("FIELD_COMBINATION","all_day");
      if (end_date && end_date < start_date) return fail("FIELD_COMBINATION","end_date");
      if (end_time && start_time && (end_date ?? start_date) === start_date && end_time < start_time)
        return fail("FIELD_COMBINATION","end_time");
      if (start_time && !validBratislavaWallClock(start_date,start_time))
        return fail("DATE_TIME_OR_DST","start_time");
      if (end_time && !validBratislavaWallClock(end_date ?? start_date,end_time))
        return fail("DATE_TIME_OR_DST","end_time");
      if ((end_date ?? start_date) < today) return fail("HISTORICAL_OR_CANCELLED",end_date ? "end_date" : "start_date");
      if (v.cancelled) return fail("HISTORICAL_OR_CANCELLED","cancelled");

      if (!Array.isArray(v.source_urls) || v.source_urls.length < 1 || v.source_urls.length > 8)
        return fail("EVIDENCE_INVALID","source_urls");
      const sources: string[] = [];
      for (const url of v.source_urls) {
        if (badUrl(url)) return fail("URL_INVALID_OR_FORBIDDEN","source_urls");
        const normalized = publicEventUrl(url) as string;
        if (new URL(normalized).hostname.replace(/^www\./,"") === "psipedia.sk")
          return fail("URL_INVALID_OR_FORBIDDEN","source_urls");
        if (!sources.includes(normalized)) sources.push(normalized);
      }
      if (!Array.isArray(v.evidence) || v.evidence.length < 1 || v.evidence.length > 8)
        return fail("EVIDENCE_INVALID","evidence");
      const supported = new Set<string>();
      for (const value of v.evidence) {
        const item = object(value);
        if (!item) return fail("EVIDENCE_INVALID","evidence");
        if (Object.keys(item).some(k => !EVIDENCE_KEYS.includes(k as typeof EVIDENCE_KEYS[number])))
          return fail("UNKNOWN_KEY");
        if (!Object.hasOwn(item,"source_url")) return fail("REQUIRED_KEY_MISSING","source_url");
        if (!Object.hasOwn(item,"fields")) return fail("REQUIRED_KEY_MISSING","fields");
        if (badUrl(item.source_url)) return fail("URL_INVALID_OR_FORBIDDEN","source_url");
        if (!sources.includes(publicEventUrl(item.source_url) as string))
          return fail("EVIDENCE_INVALID","source_url");
        if (!Array.isArray(item.fields) || item.fields.length < 1 || item.fields.length > EVIDENCE_FIELDS.length ||
          item.fields.some(f => !EVIDENCE_FIELDS.includes(f as typeof EVIDENCE_FIELDS[number])))
          return fail("EVIDENCE_INVALID","fields");
        for (const field of item.fields) supported.add(field);
      }
      if (!["title","organizer","start_date"].every(field => supported.has(field)) ||
        (v.online ? !supported.has("online") && !supported.has("event_url") :
          !supported.has("city") && !supported.has("venue")))
        return fail("EVIDENCE_INVALID","evidence");
    }
    return diagnostic("UNCLASSIFIED");
  } catch {
    // Never expose exceptions, provider-owned keys or values.
    return diagnostic("UNCLASSIFIED");
  }
}
