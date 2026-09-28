import type { ControlledHtmlAdapter } from "./data-automation-connectors.ts";
import {
  TRNAVA_ADOPTION_DETAIL_ADAPTER,
  trnavaAdoptionDetailAdapter,
} from "./data-automation-adoption-adapters.ts";
import {
  ZATULANE_PSIKY_SALA_FOSTER_DETAIL_ADAPTER,
  zatulanePsikySalaFosterDetailAdapter,
} from "./data-automation-foster-adapters.ts";
import {
  KOSICE_FOUND_DOG_DETAIL_ADAPTER,
  kosiceFoundDogDetailAdapter,
} from "./data-automation-lost-found-adapters.ts";
import { canonicalizeSourceUrl, normalizeAutomationIdentity, type AutomationSourceRecord } from "./data-automation.ts";
import { parseOrganizationDirectory } from "./data-automation-organization-enrichment.ts";
import {
  GENERIC_DIRECTORY_PROFILE_ADAPTER,
  GENERIC_HELP_ITEM_PAGE_ADAPTER,
  ORGANIZATION_OFFICIAL_SITE_ADAPTER,
  ORGANIZATION_PSIADUSA_DIRECTORY_ADAPTER,
} from "./data-automation-source-provisioning.ts";

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function textFromHtml(value: string) {
  return decodeHtml(
    value
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  ).replace(/\s+/g, " ").trim();
}

type TableCell = { text: string; href: string | null };

function htmlRows(html: string) {
  const rows: TableCell[][] = [];
  for (const rowMatch of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells: TableCell[] = [];
    for (const cellMatch of rowMatch[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)) {
      const raw = cellMatch[1];
      const hrefMatch = raw.match(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/i);
      cells.push({ text: textFromHtml(raw), href: hrefMatch ? decodeHtml(hrefMatch[1]).trim() : null });
    }
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function absolutePublicUrl(href: string | null, base: string | null) {
  if (!href || !base) return null;
  try {
    return canonicalizeSourceUrl(new URL(href, base).toString());
  } catch {
    return null;
  }
}

function isoDate(year: number, month: number, day: number) {
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseSlovakDateRange(value: string) {
  const normalized = value
    .replace(/\u00a0/g, " ")
    .replace(/[—–−]/g, "-")
    .replace(/(\d)\s*\.\s*-\s*(\d)/g, "$1. - $2")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;

  const parts = normalized.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
  const numberParts = parts.map((part) => [...part.matchAll(/\d+/g)].map((match) => Number(match[0])));
  const endNumbers = numberParts[numberParts.length - 1] ?? [];
  const endYear = endNumbers.find((number) => number >= 2000) ?? null;
  if (!endYear) return null;

  const endBeforeYear = endNumbers.filter((number) => number < 2000);
  const endDay = endBeforeYear[0] ?? null;
  const endMonth = endBeforeYear[1] ?? null;
  if (!endDay || !endMonth) return null;

  const startNumbers = numberParts[0] ?? [];
  const startBeforeYear = startNumbers.filter((number) => number < 2000);
  const startYear = startNumbers.find((number) => number >= 2000) ?? endYear;
  const startDay = startBeforeYear[0] ?? endDay;
  const startMonth = startBeforeYear[1] ?? endMonth;

  const startDate = isoDate(startYear, startMonth, startDay);
  const endDate = isoDate(endYear, endMonth, endDay);
  return startDate && endDate ? { startDate, endDate } : null;
}

export const skjExhibitionCalendarAdapter: ControlledHtmlAdapter = ({ html, source }) => {
  const records: AutomationSourceRecord[] = [];
  for (const cells of htmlRows(html)) {
    if (cells.length < 3) continue;
    const city = cells[0]?.text.trim();
    const title = cells[1]?.text.trim();
    const range = parseSlovakDateRange(cells[cells.length - 1]?.text ?? "");
    if (!city || !title || !range || Number(range.startDate.slice(0, 4)) < 2026) continue;

    const eventUrl = absolutePublicUrl(cells[1]?.href ?? null, source.sourceUrl);
    const identity = [range.startDate, normalizeAutomationIdentity(city), normalizeAutomationIdentity(title)].join(":");
    records.push({
      sourceRecordId: identity.slice(0, 240),
      sourceUrl: eventUrl ?? source.sourceUrl,
      sourceTimestamp: null,
      rawRecord: { city, title, dateText: cells[cells.length - 1]?.text ?? "", eventUrl },
      proposed: {
        title,
        startDate: range.startDate,
        endDate: range.endDate,
        city,
        organizer: "Slovenská kynologická jednota (SKJ)",
        websiteUrl: eventUrl,
      },
    });
  }
  return records;
};

export const svpsSheltersRegisterAdapter: ControlledHtmlAdapter = ({ html, source }) => {
  const records: AutomationSourceRecord[] = [];
  for (const cells of htmlRows(html)) {
    if (cells.length < 8) continue;
    const approvalNumber = cells[0]?.text.trim();
    if (!/^SK\s+(?:U|Ú|KS)\b/i.test(approvalNumber ?? "")) continue;

    const owner = cells[2]?.text.trim() ?? "";
    const facility = cells[3]?.text.trim() ?? "";
    const address = cells[4]?.text.trim() ?? "";
    const city = cells[5]?.text.trim() ?? "";
    const district = cells[6]?.text.trim() ?? "";
    const region = cells[7]?.text.trim() ?? "";
    const activity = cells[8]?.text.trim() ?? "";
    const name = facility || owner;
    if (!name) continue;

    const importKey = `svps:${normalizeAutomationIdentity(approvalNumber).replace(/\s+/g, "-")}`;
    records.push({
      sourceRecordId: approvalNumber.slice(0, 240),
      sourceUrl: source.sourceUrl,
      sourceTimestamp: null,
      rawRecord: { approvalNumber, owner, facility, address, city, district, region, activity },
      proposed: {
        importKey,
        name,
        city,
        district,
        region,
        address,
        operatorName: owner || null,
        sourceApprovalNumber: approvalNumber,
        sourceActivity: activity || null,
        sourceUrl: source.sourceUrl,
      },
    });
  }
  return records;
};


function htmlLines(value: string) {
  return decodeHtml(
    value
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/p\s*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function labelledLine(lines: string[], label: string) {
  const prefix = label.toLocaleLowerCase("sk-SK") + ":";
  const line = lines.find((item) => item.toLocaleLowerCase("sk-SK").startsWith(prefix));
  return line ? line.slice(line.indexOf(":") + 1).trim() : "";
}

function eventPlace(value: string) {
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return { venue: value.trim(), city: "" };
  return {
    venue: parts.slice(0, -1).join(", "),
    city: parts[parts.length - 1] ?? "",
  };
}

export const agilitySkEventsAdapter: ControlledHtmlAdapter = ({ html, source }) => {
  const records: AutomationSourceRecord[] = [];
  const rowPattern = /<div\b[^>]*class\s*=\s*["'][^"']*\brow\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;

  for (const rowMatch of html.matchAll(rowPattern)) {
    const rowHtml = rowMatch[1];
    const paragraphs = [...rowHtml.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((match) => htmlLines(match[1]))
      .filter((lines) => lines.length > 0);
    const main = paragraphs.find((lines) => lines.some((line) => /^Termín\s*:/i.test(line)));
    const meta = paragraphs.find((lines) => lines.some((line) => /^Organizátor\s*:/i.test(line)));
    if (!main || !meta) continue;

    const title = main.find((line) => !/^(Termín|Miesto)\s*:/i.test(line))?.trim() ?? "";
    const dateText = labelledLine(main, "Termín");
    const placeText = labelledLine(main, "Miesto");
    const organizer = labelledLine(meta, "Organizátor");
    const judges = labelledLine(meta, "Rozhodcovia");
    const surface = labelledLine(meta, "Povrch");
    const range = parseSlovakDateRange(dateText);
    if (!title || !range) continue;

    const place = eventPlace(placeText);
    const hrefMatch = rowHtml.match(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/i);
    const eventUrl = absolutePublicUrl(hrefMatch ? decodeHtml(hrefMatch[1]).trim() : null, source.sourceUrl);
    const identity = [
      range.startDate,
      normalizeAutomationIdentity(title),
      normalizeAutomationIdentity(organizer),
    ].join(":");
    const practicalInfo = [
      judges ? `Rozhodcovia: ${judges}` : "",
      surface ? `Povrch: ${surface}` : "",
    ].filter(Boolean).join("\n");

    records.push({
      sourceRecordId: identity.slice(0, 240),
      sourceUrl: eventUrl ?? source.sourceUrl,
      sourceTimestamp: null,
      rawRecord: {
        title,
        dateText,
        place: placeText,
        organizer,
        judges,
        surface,
        eventUrl,
      },
      proposed: {
        title,
        startDate: range.startDate,
        endDate: range.endDate,
        venue: place.venue,
        ...(place.city ? { city: place.city } : {}),
        organizer: organizer || null,
        practicalInfo: practicalInfo || null,
        websiteUrl: eventUrl ?? source.sourceUrl,
      },
    });
  }

  return records;
};


const ZSK_CALENDAR_CATEGORIES = new Map<string, string>([
  ["medzinarodne akcie", "Medzinárodné akcie"],
  ["narodne akcie", "Národné akcie"],
  ["kvalifikacne preteky", "Kvalifikačné preteky"],
  ["skusky medzinarodne", "Skúšky medzinárodné"],
  ["skusky narodne", "Skúšky národné"],
  ["skusky obedience a rally obedience", "Skúšky obedience a Rally obedience"],
  ["skusky zachranarske", "Skúšky záchranárske"],
  ["skusky bvk", "Skúšky BVK"],
  ["skusky mondioring", "Skúšky Mondioring"],
  ["skusky wesensbeurteilung", "Skúšky Wesensbeurteilung"],
  ["sportove kynologicke akcie", "Športové kynologické akcie"],
]);

function htmlAnchors(html: string, base: string | null) {
  const links: Array<{ text: string; url: string }> = [];
  for (const match of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = absolutePublicUrl(decodeHtml(match[1]).trim(), base);
    if (url) links.push({ text: textFromHtml(match[2]), url });
  }
  return links;
}

function latestTrustedZskIframe(html: string, base: string | null) {
  for (const match of html.matchAll(/<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    const url = absolutePublicUrl(decodeHtml(match[1]).trim(), base);
    if (!url) continue;
    try {
      const parsed = new URL(url);
      if (parsed.hostname === "suchno.sk" && parsed.pathname.startsWith("/app_test/")) return url;
    } catch {
      // Invalid URLs are ignored and never fetched.
    }
  }
  return null;
}

function parseZskSlashDate(value: string) {
  const match = value.trim().match(/^(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})$/);
  if (!match) return null;
  return isoDate(Number(match[3]), Number(match[2]), Number(match[1]));
}

function parseZskDateRange(value: string) {
  const normalized = value.replace(/[—–−]/g, "-").replace(/\s+/g, " ").trim();
  const parts = normalized.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 1 || parts.length > 2) return null;
  const startDate = parseZskSlashDate(parts[0]);
  if (!startDate) return null;
  if (parts.length === 1) return { startDate, endDate: null };
  const endDate = parseZskSlashDate(parts[1]);
  if (!endDate || endDate < startDate) return null;
  return { startDate, endDate };
}

function conservativeZskCity(value: string) {
  const city = value.replace(/\s+/g, " ").trim();
  if (!city || city.length > 80 || /[,/\\\d]/.test(city)) return null;
  if (/\b(?:kk|mkk|ksk|kškl?|arena|areal|areál|cvicisko|cvičisko|klub|stadion|štadión|hala|obedience|kynolog)/i.test(city)) return null;
  return city;
}

function zskEventType(category: string) {
  const normalized = normalizeAutomationIdentity(category);
  if (normalized.includes("akcie") || normalized.includes("preteky")) return "Preteky";
  return "Iné";
}

function zskStatus(value: string) {
  const normalized = normalizeAutomationIdentity(value);
  if (normalized.includes("zrusene") || normalized.includes("zrusena") || normalized.includes("zruseny")) {
    return { status: "CANCELLED", cancelled: true };
  }
  if (normalized.includes("bude sa prekladat") || normalized.includes("prelozene") || normalized.includes("presunute")) {
    return { status: "POSTPONED", cancelled: false };
  }
  if (normalized.includes("zmena terminu")) return { status: "DATE_CHANGED", cancelled: false };
  if (normalized.includes("zmena miesta")) return { status: "VENUE_CHANGED", cancelled: false };
  return { status: null, cancelled: false };
}

function zskIdentityTitle(value: string) {
  return normalizeAutomationIdentity(value)
    .replace(/\b(?:zrusene|zrusena|zruseny|zmena terminu|zmena miesta|prelozene|presunute)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rowLinks(rowHtml: string, base: string | null) {
  return htmlAnchors(rowHtml, base);
}

export function parseZskSrCalendarTable(input: {
  html: string;
  sourceUrl: string | null;
  category: string;
}) {
  const records: AutomationSourceRecord[] = [];
  for (const rowMatch of input.html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const rowHtml = rowMatch[1];
    const cells: string[] = [];
    for (const cellMatch of rowHtml.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)) {
      cells.push(textFromHtml(cellMatch[1]));
    }
    if (cells.length < 3) continue;

    const dateText = cells[0]?.trim() ?? "";
    const venue = cells[1]?.trim() ?? "";
    const rawTitle = cells[2]?.trim() ?? "";
    const judge = cells[3]?.trim() ?? "";
    const range = parseZskDateRange(dateText);
    if (!range || !rawTitle) continue;

    const links = rowLinks(rowHtml, input.sourceUrl);
    const registration = links.find((link) => /prihl|registr/i.test(normalizeAutomationIdentity(link.text)));
    const detail = links.find((link) => /propoz|detail|viac info|informac/i.test(normalizeAutomationIdentity(link.text)));
    const status = zskStatus([rawTitle, ...cells].join(" "));
    const city = conservativeZskCity(venue);
    const sourceLink = detail?.url ?? registration?.url ?? input.sourceUrl;
    const stableLink = detail?.url ?? registration?.url ?? null;
    const year = range.startDate.slice(0, 4);
    const sourceRecordId = stableLink
      ? "url:" + stableLink
      : "zsk:" + year + ":" + zskIdentityTitle(rawTitle) + ":" + normalizeAutomationIdentity(venue);

    const practicalInfo = [
      "Kategória ZŠK: " + input.category,
      judge ? "Rozhodca: " + judge : "",
      status.status ? "Stav ZŠK: " + status.status : "",
    ].filter(Boolean).join("\n");

    records.push({
      sourceRecordId: sourceRecordId.slice(0, 240),
      sourceUrl: sourceLink,
      sourceTimestamp: null,
      rawRecord: {
        dateText,
        venue,
        title: rawTitle,
        judge: judge || null,
        category: input.category,
        status: status.status,
        links,
      },
      proposed: {
        title: rawTitle,
        startDate: range.startDate,
        ...(range.endDate ? { endDate: range.endDate } : {}),
        ...(venue ? { venue } : {}),
        ...(city ? { city } : {}),
        eventType: zskEventType(input.category),
        websiteUrl: detail?.url ?? input.sourceUrl,
        ...(registration?.url ? { registrationUrl: registration.url } : {}),
        practicalInfo,
        ...(status.cancelled ? { cancelled: true } : {}),
        ...(status.status ? { status: status.status } : {}),
      },
    });
  }
  return records;
}

export const zskSrEventsAdapter: ControlledHtmlAdapter = async ({ html, source, fetchHtml }) => {
  if (!fetchHtml) throw new Error("zsk_nested_fetch_unavailable");

  const categories = new Map<string, { label: string; url: string }>();
  for (const link of htmlAnchors(html, source.sourceUrl)) {
    const normalized = normalizeAutomationIdentity(link.text);
    const label = ZSK_CALENDAR_CATEGORIES.get(normalized);
    if (!label || categories.has(link.url)) continue;
    categories.set(link.url, { label, url: link.url });
    if (categories.size >= ZSK_CALENDAR_CATEGORIES.size) break;
  }
  if (categories.size === 0) throw new Error("zsk_calendar_categories_missing");

  const deduped = new Map<string, AutomationSourceRecord>();
  for (const category of categories.values()) {
    const categoryPage = await fetchHtml(category.url);
    const iframeUrl = latestTrustedZskIframe(categoryPage.html, categoryPage.finalUrl);
    if (!iframeUrl) continue;

    const tablePage = await fetchHtml(iframeUrl);
    for (const record of parseZskSrCalendarTable({
      html: tablePage.html,
      sourceUrl: tablePage.finalUrl,
      category: category.label,
    })) {
      const existing = deduped.get(record.sourceRecordId);
      if (!existing) {
        deduped.set(record.sourceRecordId, record);
        continue;
      }
      existing.proposed = {
        ...existing.proposed,
        ...Object.fromEntries(Object.entries(record.proposed).filter(([, value]) => value !== null && value !== undefined && value !== "")),
      };
      existing.rawRecord = {
        primary: existing.rawRecord,
        duplicateEvidence: record.rawRecord,
      };
    }
  }

  if (deduped.size === 0) throw new Error("zsk_calendar_no_records");
  return [...deduped.values()];
};


const MUSHING_MASTER_MAX = 40;
const MUSHING_DETAIL_MAX = 30;

function mushingAllowedDetailUrl(value: string | null, sourceUrl: string | null) {
  const url = absolutePublicUrl(value, sourceUrl);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname.toLowerCase() !== "mushing.sk") return null;
    if (!/^\/pretek\/[^/]+\/?$/.test(parsed.pathname)) return null;
    parsed.hash = "";
    parsed.search = "";
    return canonicalizeSourceUrl(parsed.toString());
  } catch {
    return null;
  }
}

function mushingSimpleMunicipality(value: string) {
  const city = value.replace(/\s+/g, " ").trim();
  if (!city || city.length > 80) return null;
  if (/[,/\\]|\d/.test(city)) return null;
  if (/\s[-–—]\s/.test(city)) return null;
  return city;
}

function mushingStatus(value: string) {
  const normalized = normalizeAutomationIdentity(value);
  if (normalized.includes("zrusene") || normalized.includes("zrusena") || normalized.includes("zruseny")) {
    return { status: "CANCELLED", cancelled: true };
  }
  if (normalized.includes("presunute") || normalized.includes("prelozene")) {
    return { status: "POSTPONED", cancelled: false };
  }
  if (normalized.includes("zmena datumu") || normalized.includes("zmena terminu")) {
    return { status: "DATE_CHANGED", cancelled: false };
  }
  return { status: null, cancelled: false };
}

function mushingCleanTitle(value: string) {
  return value
    .replace(/\bZRUŠEN[ÉÁÝ]\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mushingDetailFields(html: string, detailUrl: string) {
  const fields = new Map<string, string>();
  for (const cells of htmlRows(html)) {
    if (cells.length < 2) continue;
    const label = normalizeAutomationIdentity(cells[0]?.text ?? "");
    const value = cells.slice(1).map((cell) => cell.text).join(" ").replace(/\s+/g, " ").trim();
    if (label && value && !fields.has(label)) fields.set(label, value);
  }

  const links = htmlAnchors(html, detailUrl);
  const byText = (pattern: RegExp) => links.find((link) => pattern.test(normalizeAutomationIdentity(link.text)))?.url ?? null;
  const organizer = fields.get("usporiadatel") ?? fields.get("organizator") ?? null;
  const discipline = fields.get("druh pretekov") ?? null;
  const categories = fields.get("sutazne kategorie") ?? fields.get("kategorie") ?? null;
  const rawVenue = fields.get("miesto preteku") ?? fields.get("miesto pretekov") ?? null;
  const venue = rawVenue?.replace(/\bGPS\s*:\s*-?\d{1,2}\.\d+\s*,\s*-?\d{1,3}\.\d+.*$/i, "").trim() || null;
  const gpsText = fields.get("gps") ?? textFromHtml(html).match(/\bGPS\s*:\s*(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/i)?.[0] ?? null;
  const gpsMatch = gpsText?.match(/(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/) ?? null;

  const practical = [
    discipline ? "Druh pretekov: " + discipline : "",
    categories ? "Kategórie: " + categories : "",
  ].filter(Boolean).join("\n");

  return {
    organizer,
    discipline,
    categories,
    venue,
    registrationUrl: byText(/prihl|registracny formular|registration/),
    propositionsUrl: byText(/propoz/),
    resultsUrl: byText(/vysled/),
    practicalInfo: practical || null,
    latitude: gpsMatch ? Number(gpsMatch[1]) : null,
    longitude: gpsMatch ? Number(gpsMatch[2]) : null,
  };
}

export const szpzMushingEventsAdapter: ControlledHtmlAdapter = async ({ html, source, fetchHtml }) => {
  const parsedRows: Array<{
    dateText: string;
    rawTitle: string;
    venue: string;
    links: Array<{ text: string; url: string }>;
    detailUrl: string | null;
  }> = [];

  for (const rowMatch of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    if (parsedRows.length >= MUSHING_MASTER_MAX) break;
    const rowHtml = rowMatch[1];
    const cells: string[] = [];
    for (const cellMatch of rowHtml.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)) {
      cells.push(textFromHtml(cellMatch[1]));
    }
    if (cells.length < 3) continue;
    const dateText = cells[0]?.trim() ?? "";
    const rawTitle = cells[1]?.trim() ?? "";
    const venue = cells[2]?.trim() ?? "";
    const range = parseSlovakDateRange(dateText);
    if (!range || !rawTitle) continue;

    const links = rowLinks(rowHtml, source.sourceUrl);
    const detailUrl = links
      .map((link) => mushingAllowedDetailUrl(link.url, source.sourceUrl))
      .find((url): url is string => Boolean(url)) ?? null;
    parsedRows.push({ dateText, rawTitle, venue, links, detailUrl });
  }

  const records: AutomationSourceRecord[] = [];
  let detailFetches = 0;

  for (const row of parsedRows) {
    const range = parseSlovakDateRange(row.dateText);
    if (!range) continue;
    const status = mushingStatus(row.rawTitle + " " + row.venue);
    const title = mushingCleanTitle(row.rawTitle);
    if (!title) continue;

    let detail: ReturnType<typeof mushingDetailFields> | null = null;
    if (row.detailUrl && fetchHtml && detailFetches < MUSHING_DETAIL_MAX) {
      detailFetches += 1;
      const fetched = await fetchHtml(row.detailUrl);
      const finalUrl = mushingAllowedDetailUrl(fetched.finalUrl, source.sourceUrl);
      if (finalUrl !== row.detailUrl) throw new Error("mushing_detail_redirect_not_allowed");
      detail = mushingDetailFields(fetched.html, finalUrl);
    }

    const city = mushingSimpleMunicipality(row.venue);
    const sourceRecordId = row.detailUrl
      ? "url:" + row.detailUrl
      : [
          "mushing",
          normalizeAutomationIdentity(title),
          range.startDate,
          normalizeAutomationIdentity(row.venue),
        ].join(":");

    const practicalInfo = [
      detail?.practicalInfo ?? "",
      status.status ? "Stav SZPZ: " + status.status : "",
    ].filter(Boolean).join("\n");

    records.push({
      sourceRecordId: sourceRecordId.slice(0, 240),
      sourceUrl: row.detailUrl ?? source.sourceUrl,
      sourceTimestamp: null,
      rawRecord: {
        dateText: row.dateText,
        title: row.rawTitle,
        venue: row.venue,
        detailUrl: row.detailUrl,
        links: row.links,
        discipline: detail?.discipline ?? null,
        categories: detail?.categories ?? null,
      },
      proposed: {
        title,
        startDate: range.startDate,
        endDate: range.endDate,
        ...(detail?.venue || row.venue ? { venue: detail?.venue ?? row.venue } : {}),
        ...(city ? { city } : {}),
        ...(detail?.organizer ? { organizer: detail.organizer } : {}),
        eventType: "Preteky",
        websiteUrl: row.detailUrl ?? source.sourceUrl,
        ...(detail?.registrationUrl ? { registrationUrl: detail.registrationUrl } : {}),
        ...(detail?.propositionsUrl ? { propositionsUrl: detail.propositionsUrl } : {}),
        ...(detail?.resultsUrl ? { resultsUrl: detail.resultsUrl } : {}),
        ...(detail?.latitude !== null && detail?.latitude !== undefined ? { latitude: detail.latitude } : {}),
        ...(detail?.longitude !== null && detail?.longitude !== undefined ? { longitude: detail.longitude } : {}),
        ...(practicalInfo ? { practicalInfo } : {}),
        ...(status.cancelled ? { cancelled: true } : {}),
        ...(status.status ? { status: status.status } : {}),
      },
    });
  }

  if (records.length === 0) throw new Error("mushing_calendar_no_records");
  return records;
};


function htmlAttribute(tag: string, name: string) {
  const match = tag.match(new RegExp("\\b" + name + "\\s*=\\s*[\"']([^\"']+)[\"']", "i"));
  return match ? decodeHtml(match[1]).replace(/\s+/g, " ").trim() : "";
}

function organizationMetaContent(html: string, names: string[]) {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const key = (htmlAttribute(tag, "property") || htmlAttribute(tag, "name")).toLowerCase();
    if (!names.includes(key)) continue;
    const value = htmlAttribute(tag, "content");
    if (value) return textFromHtml(value);
  }
  return "";
}

function organizationHeading(html: string) {
  const match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  return match ? textFromHtml(match[1]) : "";
}

function organizationTitle(html: string) {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match ? textFromHtml(match[1]) : "";
}

function conservativeOrganizationName(html: string) {
  const context = normalizeAutomationIdentity(textFromHtml(html).slice(0, 80_000));
  const hasOrganizationContext = /\b(utulok|azyl|obcianske zdruzenie|neziskov|organizac|zachran|pomoc psom|adopci|opustenym psom|zvierat)\b/.test(context);
  if (!hasOrganizationContext) return null;

  const candidates = [
    organizationMetaContent(html, ["og:site_name"]),
    organizationHeading(html),
    organizationMetaContent(html, ["og:title"]),
    organizationTitle(html),
  ].map((value) => value.replace(/\s+/g, " ").trim()).filter(Boolean);

  for (const value of candidates) {
    if (value.length < 3 || value.length > 160) continue;
    const normalized = normalizeAutomationIdentity(value);
    if (!normalized) continue;
    if (/^(domov|home|uvod|vitajte|welcome)$/.test(normalized)) continue;
    if (/\b(zoznam|adresar|register|directory|list)\b/.test(normalized)) continue;
    if (/\b(utulkov a organizacii|utulky a organizacie)\b/.test(normalized)) continue;
    return value;
  }
  return null;
}

export const organizationOfficialSiteAdapter: ControlledHtmlAdapter = ({ html, source }) => {
  const name = conservativeOrganizationName(html);
  if (!name || !source.sourceUrl) return [];

  const websiteUrl = canonicalizeSourceUrl(source.sourceUrl);
  if (!websiteUrl) return [];
  return [{
    sourceRecordId: ("site:" + websiteUrl).slice(0, 240),
    sourceUrl: websiteUrl,
    sourceTimestamp: null,
    rawRecord: {
      sourceUrl: websiteUrl,
      identitySource: "page_metadata",
      extractedName: name,
    },
    proposed: {
      name,
      websiteUrl,
      sourceUrl: websiteUrl,
    },
  }];
};

export const psiadusaOrganizationDirectoryAdapter: ControlledHtmlAdapter = ({ html, source }) => {
  if (!source.sourceUrl) return [];
  return parseOrganizationDirectory(html, source.sourceUrl).map((entry) => {
    const identity = [
      normalizeAutomationIdentity(entry.name),
      normalizeAutomationIdentity(entry.city),
    ].filter(Boolean).join(":");
    return {
      sourceRecordId: ("psiadusa:" + identity).slice(0, 240),
      sourceUrl: entry.sourceUrl,
      sourceTimestamp: null,
      rawRecord: {
        name: entry.name,
        city: entry.city,
        region: entry.region,
        form: entry.form,
        websiteUrl: entry.websiteUrl,
        facebookUrl: entry.facebookUrl,
        sourceUrl: entry.sourceUrl,
      },
      proposed: {
        name: entry.name,
        ...(entry.city ? { city: entry.city } : {}),
        ...(entry.region ? { region: entry.region } : {}),
        ...(entry.websiteUrl ? { websiteUrl: entry.websiteUrl } : {}),
        ...(entry.facebookUrl ? { facebookUrl: entry.facebookUrl } : {}),
        sourceUrl: entry.sourceUrl,
      },
    } satisfies AutomationSourceRecord;
  }).filter((record) => Boolean(record.sourceRecordId && String(record.proposed.name ?? "").trim()));
};


type JsonLdNode = Record<string, unknown>;

function jsonLdNodes(html: string) {
  const nodes: JsonLdNode[] = [];
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(decodeHtml(match[1]).trim());
    } catch {
      continue;
    }
    const push = (value: unknown) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return;
      const node = value as JsonLdNode;
      nodes.push(node);
      if (Array.isArray(node["@graph"])) node["@graph"].forEach(push);
    };
    if (Array.isArray(parsed)) parsed.forEach(push);
    else push(parsed);
    if (nodes.length >= 40) break;
  }
  return nodes.slice(0, 40);
}

function schemaTypes(node: JsonLdNode) {
  const raw = node["@type"];
  return (Array.isArray(raw) ? raw : [raw])
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim());
}

const DIRECTORY_SCHEMA_TYPES = new Set([
  "Organization",
  "LocalBusiness",
  "VeterinaryCare",
  "ProfessionalService",
  "AnimalShelter",
  "PetStore",
]);

function explicitSchemaUrl(value: unknown, base: string | null) {
  if (typeof value !== "string" || !value.trim() || !base) return null;
  return absolutePublicUrl(value.trim(), base);
}

function explicitSchemaStrings(value: unknown, maxLength = 500) {
  const values = Array.isArray(value) ? value : [value];
  return values
    .filter((item): item is string => typeof item === "string")
    .map((item) => textFromHtml(item).replace(/\s+/g, " ").trim())
    .filter((item) => item.length > 0 && item.length <= maxLength);
}

function singleExplicitValue(
  values: string[],
  identity: (value: string) => string = (value) => value,
) {
  const unique = new Map<string, string>();
  for (const value of values) {
    const key = identity(value);
    if (key && !unique.has(key)) unique.set(key, value);
  }
  return unique.size === 1 ? [...unique.values()][0] : null;
}

function normalizePublicPhone(value: unknown) {
  if (typeof value !== "string") return null;
  let clean = decodeHtml(value).trim().replace(/^tel:/i, "").trim();
  try {
    clean = decodeURIComponent(clean);
  } catch {
    return null;
  }
  clean = clean.replace(/\s+/g, " ");
  return clean.length >= 5 && clean.length <= 50 && /^[+0-9() .\/-]+$/.test(clean) ? clean : null;
}

function phoneIdentity(value: string) {
  return value.replace(/\D/g, "");
}

function normalizePublicEmail(value: unknown) {
  if (typeof value !== "string") return null;
  let clean = decodeHtml(value).trim().replace(/^mailto:/i, "").split("?")[0]?.trim() ?? "";
  try {
    clean = decodeURIComponent(clean);
  } catch {
    return null;
  }
  clean = clean.toLowerCase();
  return clean.length <= 180 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) ? clean : null;
}

function socialUrl(value: unknown, base: string | null, network: "facebook" | "instagram") {
  const url = explicitSchemaUrl(value, base);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const allowed = network === "facebook"
      ? new Set(["facebook.com", "www.facebook.com", "m.facebook.com"])
      : new Set(["instagram.com", "www.instagram.com"]);
    if (!allowed.has(host)) return null;
    if (network === "facebook" && /^\/(?:sharer|share\.php|dialog)(?:\/|$)/i.test(parsed.pathname)) return null;
    if (network === "instagram" && /^\/(?:accounts|developer)(?:\/|$)/i.test(parsed.pathname)) return null;
    return canonicalizeSourceUrl(parsed.toString());
  } catch {
    return null;
  }
}

function explicitSocialFromValues(value: unknown, base: string | null, network: "facebook" | "instagram") {
  const values = Array.isArray(value) ? value : [value];
  return singleExplicitValue(
    values.map((item) => socialUrl(item, base, network)).filter((item): item is string => Boolean(item)),
  );
}

function splitExplicitStreetAddress(value: string) {
  const clean = value.replace(/\s+/g, " ").trim();
  const match = clean.match(/^(.+?\D)\s+(\d+[A-Za-z]?(?:\/\d+[A-Za-z]?)?)$/u);
  if (!match) return null;
  const street = match[1].trim();
  const houseNumber = match[2].trim();
  if (street.length < 2 || street.length > 160 || houseNumber.length > 40) return null;
  return { street, houseNumber, addressFormat: "STREET" as const };
}

function explicitPostalAddress(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const address = value as Record<string, unknown>;
  const text = (key: string) => typeof address[key] === "string" ? address[key].trim() : "";
  const streetAddress = text("streetAddress");
  const locality = text("addressLocality");
  const region = text("addressRegion");
  const postalCode = text("postalCode");
  const country = typeof address.addressCountry === "string"
    ? address.addressCountry.trim()
    : address.addressCountry && typeof address.addressCountry === "object" && !Array.isArray(address.addressCountry)
      ? String((address.addressCountry as Record<string, unknown>).name ?? "").trim()
      : "";
  const formatted = [streetAddress, postalCode && locality ? postalCode + " " + locality : locality, region, country]
    .filter(Boolean).join(", ");
  const street = streetAddress ? splitExplicitStreetAddress(streetAddress) : null;
  return {
    ...(locality ? { city: locality } : {}),
    ...(region ? { region } : {}),
    ...(postalCode ? { postalCode } : {}),
    ...(street ?? {}),
    ...(formatted ? { address: formatted } : {}),
  };
}

function explicitCredentialNames(value: unknown) {
  const values = Array.isArray(value) ? value : [value];
  const names: string[] = [];
  for (const item of values.slice(0, 20)) {
    if (typeof item === "string") {
      names.push(...explicitSchemaStrings(item, 160));
      continue;
    }
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    names.push(...explicitSchemaStrings((item as Record<string, unknown>).name, 160));
  }
  return [...new Set(names)].slice(0, 20);
}

function explicitOfferCatalogServices(value: unknown) {
  const services: string[] = [];
  const catalogs = Array.isArray(value) ? value : [value];
  for (const catalog of catalogs.slice(0, 10)) {
    if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) continue;
    const rawItems = (catalog as Record<string, unknown>).itemListElement;
    const items = Array.isArray(rawItems) ? rawItems : [rawItems];
    for (const rawItem of items.slice(0, 40)) {
      if (typeof rawItem === "string") {
        services.push(...explicitSchemaStrings(rawItem, 160));
        continue;
      }
      if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) continue;
      const item = rawItem as Record<string, unknown>;
      const offered = item.itemOffered && typeof item.itemOffered === "object" && !Array.isArray(item.itemOffered)
        ? item.itemOffered as Record<string, unknown>
        : null;
      const nested = item.item && typeof item.item === "object" && !Array.isArray(item.item)
        ? item.item as Record<string, unknown>
        : null;
      services.push(...explicitSchemaStrings(offered?.serviceType, 160));
      services.push(...explicitSchemaStrings(offered?.name, 160));
      services.push(...explicitSchemaStrings(nested?.name, 160));
      if (!offered && !nested) services.push(...explicitSchemaStrings(item.name, 160));
    }
  }
  return [...new Set(services)].slice(0, 20);
}

function explicitStructuredServices(node: JsonLdNode) {
  return [...new Set([
    ...explicitSchemaStrings(node.serviceType, 160),
    ...explicitOfferCatalogServices(node.hasOfferCatalog),
  ])].slice(0, 20);
}

function labelledDirectorySnippet(text: string) {
  return /^(?:telef[oó]n|tel\.?|e-?mail|adresa|kde n[aá]s n[aá]jdete)\s*:/i.test(text.trim());
}

function directoryContactBlocks(html: string) {
  const blocks: string[] = [];
  for (const match of html.matchAll(/<address\b[^>]*>([\s\S]*?)<\/address>/gi)) {
    blocks.push(match[0].slice(0, 6000));
    if (blocks.length >= 20) return blocks;
  }
  for (const match of html.matchAll(/<(section|article|div|footer)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
    const attrs = match[2].replace(/[-_]/g, " ");
    if (!/\b(?:contact|kontakt|address|adresa|location|lokalita)\b/i.test(attrs)) continue;
    blocks.push(match[0].slice(0, 6000));
    if (blocks.length >= 20) return blocks;
  }
  for (const match of html.matchAll(/<(p|li|div|span|td|dd)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const text = textFromHtml(match[0]).slice(0, 500);
    if (!labelledDirectorySnippet(text)) continue;
    blocks.push(match[0].slice(0, 2000));
    if (blocks.length >= 20) break;
  }
  return blocks;
}

function explicitContactPhone(blocks: string[]) {
  const candidates: string[] = [];
  for (const block of blocks) {
    for (const match of block.matchAll(/<a\b[^>]*\bhref\s*=\s*["'](tel:[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const visible = normalizePublicPhone(textFromHtml(match[2]));
      const href = normalizePublicPhone(match[1]);
      if (visible || href) candidates.push(visible ?? href ?? "");
    }
    const text = textFromHtml(block).slice(0, 800);
    const labelled = text.match(/^(?:telef[oó]n|tel\.?)\s*:\s*(.+)$/i);
    const value = normalizePublicPhone(labelled?.[1]);
    if (value) candidates.push(value);
  }
  return singleExplicitValue(candidates, phoneIdentity);
}

function explicitContactEmail(blocks: string[]) {
  const candidates: string[] = [];
  for (const block of blocks) {
    for (const match of block.matchAll(/<a\b[^>]*\bhref\s*=\s*["'](mailto:[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const visible = normalizePublicEmail(textFromHtml(match[2]));
      const href = normalizePublicEmail(match[1]);
      if (visible || href) candidates.push(visible ?? href ?? "");
    }
    const text = textFromHtml(block).slice(0, 800);
    const labelled = text.match(/^(?:e-?mail)\s*:\s*(.+)$/i);
    const value = normalizePublicEmail(labelled?.[1]);
    if (value) candidates.push(value);
  }
  return singleExplicitValue(candidates, (value) => value.toLowerCase());
}

function explicitSocialFromHtml(html: string, base: string, network: "facebook" | "instagram") {
  const candidates: string[] = [];
  for (const match of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    const url = socialUrl(decodeHtml(match[1]).trim(), base, network);
    if (url) candidates.push(url);
  }
  return singleExplicitValue(candidates);
}

function explicitHtmlPostalAddress(html: string) {
  const candidates: Array<Record<string, string>> = [];
  const snippets: string[] = [];
  for (const match of html.matchAll(/<address\b[^>]*>([\s\S]*?)<\/address>/gi)) snippets.push(match[0]);
  for (const match of html.matchAll(/<(p|li|div|span|td|dd)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const text = textFromHtml(match[0]).slice(0, 800);
    if (/^(?:adresa|kde n[aá]s n[aá]jdete)\s*:/i.test(text)) snippets.push(match[0]);
    if (snippets.length >= 20) break;
  }

  for (const snippet of snippets.slice(0, 20)) {
    const lines = htmlLines(snippet)
      .map((line) => line.replace(/^(?:adresa|kde n[aá]s n[aá]jdete)\s*:\s*/i, "").trim())
      .filter(Boolean);
    const postalIndex = lines.findIndex((line) => /^\d{3}\s?\d{2}\s+\S/.test(line));
    if (postalIndex < 1) continue;
    const postal = lines[postalIndex].match(/^(\d{3}\s?\d{2})\s+(.{2,120})$/);
    if (!postal) continue;
    const streetAddress = lines[postalIndex - 1];
    const street = splitExplicitStreetAddress(streetAddress);
    if (!street) continue;
    candidates.push({
      address: streetAddress + ", " + postal[1] + " " + postal[2].trim(),
      postalCode: postal[1],
      city: postal[2].trim(),
      street: street.street,
      houseNumber: street.houseNumber,
      addressFormat: street.addressFormat,
    });
  }

  if (candidates.length === 0) return {};
  const unique = new Map<string, Record<string, string>>();
  for (const candidate of candidates) {
    const key = [candidate.address, candidate.city, candidate.postalCode]
      .map((value) => value.toLocaleLowerCase("sk-SK").replace(/\s+/g, " ").trim())
      .join("|");
    if (!unique.has(key)) unique.set(key, candidate);
  }
  return unique.size === 1 ? [...unique.values()][0] : {};
}

function explicitDirectoryNode(html: string, sourceUrl: string) {
  const candidates = jsonLdNodes(html).filter((node) =>
    schemaTypes(node).some((type) => DIRECTORY_SCHEMA_TYPES.has(type))
    && typeof node.name === "string"
    && node.name.trim().length >= 2
    && node.name.trim().length <= 160,
  );
  if (candidates.length === 0) return null;
  const canonicalSource = canonicalizeSourceUrl(sourceUrl);
  const exact = candidates.filter((node) => {
    const urls = [node.url, node["@id"]]
      .map((value) => explicitSchemaUrl(value, sourceUrl))
      .filter(Boolean);
    return Boolean(canonicalSource && urls.includes(canonicalSource));
  });
  if (exact.length === 1) return exact[0];
  if (exact.length > 1 || candidates.length !== 1) return null;
  return candidates[0];
}

export const genericDirectoryProfileAdapter: ControlledHtmlAdapter = ({ html, source }) => {
  const category = typeof source.config.staticFields?.category === "string"
    ? source.config.staticFields.category.trim()
    : "";
  const sourceUrl = canonicalizeSourceUrl(source.sourceUrl);
  if (!category || !sourceUrl || !html.trim()) return [];

  const node = explicitDirectoryNode(html, sourceUrl);
  if (!node) return [];
  const name = String(node.name ?? "").trim();
  if (!name) return [];

  const schemaDescription = typeof node.description === "string"
    ? textFromHtml(node.description).slice(0, 5000)
    : "";
  const description = schemaDescription || firstMetaDescription(html);
  const explicitUrl = explicitSchemaUrl(node.url, sourceUrl);
  const schemaAddress = explicitPostalAddress(node.address);
  const htmlAddress = explicitHtmlPostalAddress(html);
  const address = {
    ...htmlAddress,
    ...schemaAddress,
    ...(!("street" in schemaAddress) && "address" in htmlAddress ? { address: htmlAddress.address } : {}),
  };
  const contactBlocks = directoryContactBlocks(html);

  const structuredPhone = singleExplicitValue(
    explicitSchemaStrings(node.telephone, 50)
      .map((value) => normalizePublicPhone(value))
      .filter((value): value is string => Boolean(value)),
    phoneIdentity,
  );
  const structuredEmail = singleExplicitValue(
    explicitSchemaStrings(node.email, 180)
      .map((value) => normalizePublicEmail(value))
      .filter((value): value is string => Boolean(value)),
    (value) => value.toLowerCase(),
  );
  const structuredFacebook = explicitSocialFromValues(node.sameAs, sourceUrl, "facebook");
  const structuredInstagram = explicitSocialFromValues(node.sameAs, sourceUrl, "instagram");
  const publicPhone = structuredPhone ?? explicitContactPhone(contactBlocks);
  const publicEmail = structuredEmail ?? explicitContactEmail(contactBlocks);
  const facebookUrl = structuredFacebook ?? explicitSocialFromHtml(html, sourceUrl, "facebook");
  const instagramUrl = structuredInstagram ?? explicitSocialFromHtml(html, sourceUrl, "instagram");
  const services = explicitStructuredServices(node);
  const qualifications = explicitCredentialNames(node.hasCredential);
  const sourceRecordUrl = explicitSchemaUrl(node["@id"], sourceUrl) ?? explicitUrl ?? sourceUrl;

  const proposed: Record<string, unknown> = {
    name,
    category,
    semanticKind: "FACILITY_OR_SERVICE_PROFILE",
    websiteUrl: explicitUrl ?? sourceUrl,
    ...address,
  };
  if (description) proposed.description = description;
  if (publicPhone) proposed.publicPhone = publicPhone;
  if (publicEmail) proposed.publicEmail = publicEmail;
  if (facebookUrl) proposed.facebookUrl = facebookUrl;
  if (instagramUrl) proposed.instagramUrl = instagramUrl;
  if (services.length) proposed.services = services;
  if (qualifications.length) proposed.qualifications = qualifications;

  return [{
    sourceRecordId: ("url:" + sourceRecordUrl).slice(0, 240),
    sourceUrl: sourceRecordUrl,
    sourceTimestamp: null,
    rawRecord: {
      schemaType: schemaTypes(node),
      name,
      description: description || null,
      descriptionSource: schemaDescription ? "JSON_LD" : description ? "META" : null,
      address: node.address ?? (Object.keys(htmlAddress).length ? htmlAddress : null),
      publicPhone: publicPhone ?? null,
      publicEmail: publicEmail ?? null,
      facebookUrl: facebookUrl ?? null,
      instagramUrl: instagramUrl ?? null,
      services,
      qualifications,
      url: explicitUrl,
      schemaId: explicitSchemaUrl(node["@id"], sourceUrl),
    },
    proposed,
  } satisfies AutomationSourceRecord];
};


function directoryFollowUpUrls(html: string, baseUrl: string) {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }
  const urls: string[] = [];
  for (const match of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = explicitSchemaUrl(decodeHtml(match[1]).trim(), baseUrl);
    if (!href) continue;
    let parsed: URL;
    try {
      parsed = new URL(href);
    } catch {
      continue;
    }
    if (parsed.hostname.toLowerCase() !== base.hostname.toLowerCase()) continue;
    const semantic = normalizeAutomationIdentity(
      textFromHtml(match[2]) + " " + parsed.pathname.replace(/[-_]/g, " "),
    );
    if (!/(kontakt|contact|o nas|about|sluzb|cennik)/.test(semantic)) continue;
    if (!urls.includes(href)) urls.push(href);
    if (urls.length >= 3) break;
  }
  return urls;
}

const productionGenericDirectoryProfileAdapter: ControlledHtmlAdapter = async (input) => {
  const baseRecords = await genericDirectoryProfileAdapter(input);
  if (!baseRecords.length || !input.fetchHtml) return baseRecords;

  const record = baseRecords[0];
  const proposed = { ...record.proposed };
  const needsFollowUp = !proposed.publicPhone
    || !proposed.publicEmail
    || !proposed.description
    || !proposed.address
    || !proposed.facebookUrl
    || !proposed.instagramUrl;
  if (!needsFollowUp) return baseRecords;

  const sourceUrl = canonicalizeSourceUrl(input.source.sourceUrl);
  if (!sourceUrl) return baseRecords;

  const fetched: Array<{ url: string; html: string }> = [];
  for (const url of directoryFollowUpUrls(input.html, sourceUrl)) {
    try {
      const page = await input.fetchHtml(url);
      let finalUrl: URL;
      let root: URL;
      try {
        finalUrl = new URL(page.finalUrl);
        root = new URL(sourceUrl);
      } catch {
        continue;
      }
      if (finalUrl.hostname.toLowerCase() !== root.hostname.toLowerCase()) continue;
      fetched.push({ url: canonicalizeSourceUrl(page.finalUrl) ?? url, html: page.html });
    } catch {
      // First-party follow-up is best-effort. The valid primary record survives.
    }
  }
  if (!fetched.length) return baseRecords;

  const combinedHtml = fetched.map((item) => item.html).join("\n");
  const blocks = directoryContactBlocks(combinedHtml);
  if (!proposed.publicPhone) {
    const value = explicitContactPhone(blocks);
    if (value) proposed.publicPhone = value;
  }
  if (!proposed.publicEmail) {
    const value = explicitContactEmail(blocks);
    if (value) proposed.publicEmail = value;
  }
  if (!proposed.facebookUrl) {
    const values = fetched
      .map((item) => explicitSocialFromHtml(item.html, item.url, "facebook"))
      .filter((value): value is string => Boolean(value));
    const value = singleExplicitValue(values);
    if (value) proposed.facebookUrl = value;
  }
  if (!proposed.instagramUrl) {
    const values = fetched
      .map((item) => explicitSocialFromHtml(item.html, item.url, "instagram"))
      .filter((value): value is string => Boolean(value));
    const value = singleExplicitValue(values);
    if (value) proposed.instagramUrl = value;
  }
  if (!proposed.address) {
    const address = explicitHtmlPostalAddress(combinedHtml);
    Object.assign(proposed, address);
  }
  if (!proposed.description) {
    const descriptions = fetched
      .map((item) => firstMetaDescription(item.html))
      .filter(Boolean);
    const description = singleExplicitValue(descriptions);
    if (description) proposed.description = description;
  }

  return [{
    ...record,
    proposed,
    rawRecord: {
      ...(record.rawRecord && typeof record.rawRecord === "object" && !Array.isArray(record.rawRecord)
        ? record.rawRecord as Record<string, unknown>
        : { primary: record.rawRecord }),
      enrichment: {
        firstPartyFollowUpUrls: fetched.map((item) => item.url),
      },
    },
  }];
}

function firstMetaDescription(html: string) {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const key = (htmlAttribute(tag, "name") || htmlAttribute(tag, "property")).toLowerCase();
    if (key !== "description" && key !== "og:description") continue;
    const value = htmlAttribute(tag, "content");
    if (value) return textFromHtml(value).slice(0, 5000);
  }
  return "";
}

export const genericHelpItemPageAdapter: ControlledHtmlAdapter = ({ html, source }) => {
  const category = typeof source.config.staticFields?.category === "string"
    ? source.config.staticFields.category.trim()
    : "";
  const sourceUrl = canonicalizeSourceUrl(source.sourceUrl);
  if (!sourceUrl || !["zbierky", "dobrovolnictvo"].includes(category)) return [];

  const title = organizationHeading(html);
  const description = firstMetaDescription(html);
  if (!title || title.length > 180 || !description) return [];

  const explicitText = normalizeAutomationIdentity(title + " " + description);
  const categorySignal = category === "zbierky"
    ? /\b(zbierk|dar|prispe|financn|transparentn|ucet)\w*/.test(explicitText)
    : /\b(dobrovol|vencen|prevoz|materialn)\w*/.test(explicitText);
  if (!categorySignal) return [];

  return [{
    sourceRecordId: ("url:" + sourceUrl).slice(0, 240),
    sourceUrl,
    sourceTimestamp: null,
    rawRecord: {
      title,
      description,
      category,
      sourceUrl,
    },
    proposed: {
      title,
      category,
      description,
      actionUrl: sourceUrl,
    },
  } satisfies AutomationSourceRecord];
};

export const productionAutomationHtmlAdapters: Record<string, ControlledHtmlAdapter> = {
  [TRNAVA_ADOPTION_DETAIL_ADAPTER]: trnavaAdoptionDetailAdapter,
  [ZATULANE_PSIKY_SALA_FOSTER_DETAIL_ADAPTER]: zatulanePsikySalaFosterDetailAdapter,
  [KOSICE_FOUND_DOG_DETAIL_ADAPTER]: kosiceFoundDogDetailAdapter,
  [GENERIC_DIRECTORY_PROFILE_ADAPTER]: productionGenericDirectoryProfileAdapter,
  [GENERIC_HELP_ITEM_PAGE_ADAPTER]: genericHelpItemPageAdapter,
  [ORGANIZATION_OFFICIAL_SITE_ADAPTER]: organizationOfficialSiteAdapter,
  [ORGANIZATION_PSIADUSA_DIRECTORY_ADAPTER]: psiadusaOrganizationDirectoryAdapter,
  "skj-exhibition-calendar": skjExhibitionCalendarAdapter,
  "svps-shelters-register": svpsSheltersRegisterAdapter,
  "agility-sk-events": agilitySkEventsAdapter,
  "zsk-sr-events": zskSrEventsAdapter,
  "szpz-mushing-events": szpzMushingEventsAdapter,
};
