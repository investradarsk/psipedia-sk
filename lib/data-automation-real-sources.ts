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

export const productionAutomationHtmlAdapters: Record<string, ControlledHtmlAdapter> = {
  "skj-exhibition-calendar": skjExhibitionCalendarAdapter,
  "svps-shelters-register": svpsSheltersRegisterAdapter,
};
