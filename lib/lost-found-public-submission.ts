import { normalizeEmail, normalizePhone } from "@/lib/pii-crypto";
import { normalizePlainText } from "@/lib/submission-security";
import {
  chipStates,
  dogReportTypes,
  dogSexes,
  dogSizes,
  type ChipState,
  type DogReportType,
  type DogSex,
  type DogSize,
} from "@/lib/lost-found-dogs";

export const LOST_FOUND_PUBLIC_SOURCE = "Používateľské hlásenie";
export const LOST_FOUND_PUBLIC_CONTACT_NOTE = "Kontakt sprostredkuje administrácia Psipedia.sk.";
export const LOST_FOUND_TURNSTILE_ACTION = "lost_found_public_submit";

const SLOVAK_REGIONS = new Set([
  "Bratislavský kraj",
  "Trnavský kraj",
  "Trenčiansky kraj",
  "Nitriansky kraj",
  "Žilinský kraj",
  "Banskobystrický kraj",
  "Prešovský kraj",
  "Košický kraj",
]);

const EMAIL_LIKE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_LIKE = /(?:\+?\d[\d\s().-]{7,}\d)/;
const URL_LIKE = /https?:\/\//gi;

export class PublicLostFoundSubmissionError extends Error {
  readonly status: number;
  readonly code: string;
  readonly field: string | null;

  constructor(message: string, status = 422, code = "INVALID_SUBMISSION", field: string | null = null) {
    super(message);
    this.name = "PublicLostFoundSubmissionError";
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

function scalar(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}

function plain(value: FormDataEntryValue | null, field: string, max: number, min = 0) {
  try {
    return normalizePlainText(scalar(value), { field, max, min });
  } catch {
    throw new PublicLostFoundSubmissionError("Skontrolujte vyplnené údaje.", 422, "INVALID_FIELD", field);
  }
}

function optionalPlain(value: FormDataEntryValue | null, field: string, max: number) {
  const raw = scalar(value).trim();
  return raw ? plain(value, field, max) : "";
}

function oneOf<T extends string>(value: string, allowed: readonly T[], field: string): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new PublicLostFoundSubmissionError("Skontrolujte vyplnené údaje.", 422, "INVALID_FIELD", field);
  }
  return value as T;
}

function todayInBratislava(now: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bratislava",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function eventDate(value: string, now: Date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new PublicLostFoundSubmissionError("Zadajte platný dátum udalosti.", 422, "INVALID_DATE", "eventDate");
  }
  const parsed = new Date(value + "T12:00:00Z");
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value || value > todayInBratislava(now)) {
    throw new PublicLostFoundSubmissionError("Dátum udalosti nemôže byť v budúcnosti.", 422, "INVALID_DATE", "eventDate");
  }
  return value;
}

function lastSeenDateTime(value: string, type: DogReportType, now: Date) {
  if (!value) {
    if (type === "LOST") {
      throw new PublicLostFoundSubmissionError("Pri stratenom psovi uveďte, kedy bol naposledy videný.", 422, "MISSING_LAST_SEEN", "lastSeenDateTime");
    }
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.getTime() > now.getTime() + 5 * 60 * 1000) {
    throw new PublicLostFoundSubmissionError("Čas udalosti nie je platný.", 422, "INVALID_LAST_SEEN", "lastSeenDateTime");
  }
  return parsed.toISOString();
}

function rejectContactInPublicText(value: string, field: string) {
  if (EMAIL_LIKE.test(value) || PHONE_LIKE.test(value)) {
    throw new PublicLostFoundSubmissionError(
      "Telefón alebo e-mail zadajte iba do kontaktných polí, nie do verejného popisu.",
      422,
      "PRIVATE_DATA_IN_PUBLIC_FIELD",
      field,
    );
  }
  return value;
}

export type NormalizedPublicLostFoundSubmission = {
  type: DogReportType;
  dogName: string | null;
  sex: DogSex;
  breed: string;
  breedUnknown: boolean;
  color: string;
  approximateAge: string;
  size: DogSize;
  description: string;
  distinguishingMarks: string;
  collarDescription: string;
  chipped: ChipState;
  eventDate: string;
  lastSeenDateTime: string | null;
  region: string;
  district: string;
  city: string;
  locationDescription: string;
  contactName: string | null;
  contactPhone: string | null;
  normalizedPhone: string | null;
  contactEmail: string | null;
  normalizedEmail: string | null;
  riskFlags: string[];
};

export function normalizePublicLostFoundSubmission(form: FormData, now = new Date()): NormalizedPublicLostFoundSubmission {
  const type = oneOf(scalar(form.get("type")), dogReportTypes, "type");
  const description = rejectContactInPublicText(plain(form.get("description"), "description", 3000, 20), "description");
  const distinguishingMarks = rejectContactInPublicText(optionalPlain(form.get("distinguishingMarks"), "distinguishingMarks", 800), "distinguishingMarks");
  const collarDescription = rejectContactInPublicText(optionalPlain(form.get("collarDescription"), "collarDescription", 500), "collarDescription");
  const locationDescription = rejectContactInPublicText(optionalPlain(form.get("locationDescription"), "locationDescription", 700), "locationDescription");
  const region = plain(form.get("region"), "region", 80, 1);
  if (!SLOVAK_REGIONS.has(region)) {
    throw new PublicLostFoundSubmissionError("Vyberte platný kraj.", 422, "INVALID_REGION", "region");
  }
  const city = plain(form.get("city"), "city", 120, 1);
  const rawPhone = optionalPlain(form.get("contactPhone"), "contactPhone", 80);
  const rawEmail = optionalPlain(form.get("contactEmail"), "contactEmail", 254);
  if (!rawPhone && !rawEmail) {
    throw new PublicLostFoundSubmissionError("Uveďte telefón alebo e-mail, aby vás moderátor vedel kontaktovať.", 422, "MISSING_CONTACT", "contactPhone");
  }

  let normalizedPhone: string | null = null;
  if (rawPhone) {
    try {
      normalizedPhone = normalizePhone(rawPhone);
    } catch {
      throw new PublicLostFoundSubmissionError("Telefón nemá platný formát.", 422, "INVALID_PHONE", "contactPhone");
    }
  }

  let normalizedEmail: string | null = null;
  if (rawEmail) {
    try {
      normalizedEmail = normalizeEmail(rawEmail);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new Error("invalid");
    } catch {
      throw new PublicLostFoundSubmissionError("E-mail nemá platný formát.", 422, "INVALID_EMAIL", "contactEmail");
    }
  }

  const riskFlags: string[] = [];
  const urlCount = (description.match(URL_LIKE) ?? []).length;
  if (urlCount >= 2) riskFlags.push("EXCESSIVE_URLS");
  if (/(.)\1{11,}/u.test(description)) riskFlags.push("REPEATED_CHARACTERS");

  const breedUnknown = scalar(form.get("breedUnknown")) === "1";
  return {
    type,
    dogName: optionalPlain(form.get("dogName"), "dogName", 120) || null,
    sex: oneOf(scalar(form.get("sex")) || "UNKNOWN", dogSexes, "sex"),
    breed: breedUnknown ? "" : optionalPlain(form.get("breed"), "breed", 160),
    breedUnknown,
    color: optionalPlain(form.get("color"), "color", 160),
    approximateAge: optionalPlain(form.get("approximateAge"), "approximateAge", 120),
    size: oneOf(scalar(form.get("size")) || "UNKNOWN", dogSizes, "size"),
    description,
    distinguishingMarks,
    collarDescription,
    chipped: oneOf(scalar(form.get("chipped")) || "UNKNOWN", chipStates, "chipped"),
    eventDate: eventDate(plain(form.get("eventDate"), "eventDate", 10, 10), now),
    lastSeenDateTime: lastSeenDateTime(scalar(form.get("lastSeenDateTime")), type, now),
    region,
    district: optionalPlain(form.get("district"), "district", 120),
    city,
    locationDescription,
    contactName: optionalPlain(form.get("contactName"), "contactName", 160) || null,
    contactPhone: rawPhone || null,
    normalizedPhone,
    contactEmail: rawEmail || null,
    normalizedEmail,
    riskFlags,
  };
}

export function publicLostFoundHoneypotTriggered(form: FormData) {
  return scalar(form.get("website")).trim().length > 0;
}

export function publicLostFoundImage(form: FormData) {
  const value = form.get("image");
  return value instanceof File && value.size > 0 ? value : null;
}
