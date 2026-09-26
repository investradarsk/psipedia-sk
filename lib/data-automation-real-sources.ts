import type { ControlledHtmlAdapter } from "./data-automation-connectors.ts";
import { canonicalizeSourceUrl, normalizeAutomationIdentity, type AutomationSourceRecord } from "./data-automation.ts";

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
  const venue = fields.get("miesto preteku") ?? fields.get("miesto pretekov") ?? null;
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

export const productionAutomationHtmlAdapters: Record<string, ControlledHtmlAdapter> = {
  "skj-exhibition-calendar": skjExhibitionCalendarAdapter,
  "svps-shelters-register": svpsSheltersRegisterAdapter,
  "agility-sk-events": agilitySkEventsAdapter,
  "zsk-sr-events": zskSrEventsAdapter,
  "szpz-mushing-events": szpzMushingEventsAdapter,
};
