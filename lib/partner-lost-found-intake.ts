/**
 * Shared validation for a Partner-owned LOST/FOUND report.
 *
 * Unpublished drafts are deliberately allowed to be incomplete. Only the
 * SUBMIT transition needs the same essential details as the retired public
 * intake; this helper is used by the client and again by the server.
 *
 * Private account contact data is NEVER read or returned here. The Partner
 * account is the reporter identity, not the public_contact_* fields.
 */
export type LostFoundIntakeIssue = { field: string; message: string };

const SLOVAK_TIME_ZONE = "Europe/Bratislava";

function slovakToday(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: SLOVAK_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (key: string) => parts.find(part => part.type === key)?.value ?? "";
  return get("year") + "-" + get("month") + "-" + get("day");
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T12:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function getPartnerLostFoundSubmitIssue(
  values: Record<string, unknown>,
  now = new Date(),
): LostFoundIntakeIssue | null {
  const value = (key: string) => typeof values[key] === "string" ? values[key].trim() : "";
  const kind = value("type");
  if (kind !== "LOST" && kind !== "FOUND")
    return { field: "type", message: "Vyberte, či je pes stratený alebo nájdený." };

  const day = value("event_date");
  if (!validDate(day) || day > slovakToday(now))
    return { field: "event_date", message: "Zadajte platný dátum udalosti, ktorý nie je v budúcnosti." };

  if (!value("region"))
    return { field: "region", message: "Vyplňte kraj, v ktorom sa pes stratil alebo našiel." };
  if (!value("city"))
    return { field: "city", message: "Vyplňte obec alebo mesto udalosti." };
  if (value("description").length < 20)
    return { field: "description", message: "Popíšte udalosť aspoň 20 znakmi, aby bolo hlásenie užitočné." };

  if (kind === "LOST") {
    const seen = value("last_seen_date_time");
    if (!seen)
      return { field: "last_seen_date_time", message: "Pri stratenom psovi uveďte dátum a čas, kedy bol naposledy videný." };
    const time = Date.parse(seen);
    if (!Number.isFinite(time) || time > now.getTime() + 5 * 60 * 1000)
      return { field: "last_seen_date_time", message: "Skontrolujte dátum a čas posledného videnia psa." };
  }
  return null;
}

/** Show ISO timestamps in the report location's clock, not the reader's device timezone. */
export function partnerLostFoundTimeForInput(value: string): string {
  if (!value.trim()) return "";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: SLOVAK_TIME_ZONE, year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(parsed);
  const get = (key: string) => parts.find(part => part.type === key)?.value ?? "";
  return get("year") + "-" + get("month") + "-" + get("day") + "T" + get("hour") + ":" + get("minute");
}

/**
 * Turn a datetime-local value representing Slovakia's wall clock into UTC.
 * Server retains UTC ISO just like the former public submission endpoint.
 */
export function partnerLostFoundTimeForSave(value: string): string {
  if (!value) return "";
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return value;
  const naiveUtc = Date.parse(value + ":00Z");
  if (!Number.isFinite(naiveUtc)) return value;
  const offset = (instant: number) => {
    const local = partnerLostFoundTimeForInput(new Date(instant).toISOString());
    const asUtc = Date.parse(local + ":00Z");
    return asUtc - instant;
  };
  let instant = naiveUtc - offset(naiveUtc);
  instant = naiveUtc - offset(instant);
  return new Date(instant).toISOString();
}
