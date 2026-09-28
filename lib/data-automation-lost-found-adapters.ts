import type { ControlledHtmlAdapter } from "./data-automation-connectors.ts";
import { canonicalizeSourceUrl, type AutomationSourceRecord } from "./data-automation.ts";

export const KOSICE_FOUND_DOG_DETAIL_ADAPTER = "kosice-found-dog-detail";

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
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/(?:p|div|section|article|li|h[1-6])\s*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function supportedKosiceDetailUrl(value: string | null) {
  const canonical = canonicalizeSourceUrl(value);
  if (!canonical) return null;
  try {
    const url = new URL(canonical);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "kosice.sk") return null;
    if (!/^\/clanok\/(?:najden[yae]|opusten[yae])-[a-z0-9-]+\/?$/i.test(url.pathname)) return null;
    return canonical;
  } catch {
    return null;
  }
}

function heading(html: string) {
  const match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  return match ? textFromHtml(match[1]) : "";
}

function isDogHeading(value: string) {
  const normalized = value.toLocaleLowerCase("sk-SK");
  if (/\b(?:mačka|macka|kocúr|kocur)\b/.test(normalized)) return false;
  return /\b(?:pes|psík|psik|fenka|fena|sučka|sucka|šteňa|stena|šteniatko|steniatko|šteniatka|steniatka)\b/.test(normalized);
}

function isoDate(year: number, month: number, day: number) {
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function explicitFoundEventDate(pageText: string) {
  const match = pageText.match(/\bDňa\s+(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{4})\b[^\n]{0,240}?\b(?:bol|bola|bolo|boli)\s+n[aá]jden/i);
  if (!match) return null;
  return isoDate(Number(match[3]), Number(match[2]), Number(match[1]));
}

function reportSentence(pageText: string) {
  const parts = pageText
    .split(/\n+/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return parts.find((part) =>
    /\b(?:bol|bola|bolo|boli)\s+n[aá]jden/i.test(part)
    && /\b(?:pes|psík|psik|fenka|fena|sučka|sucka|šteňa|stena|šteniatko|steniatko)\b/i.test(part)
    && /\bKošic/i.test(part),
  ) ?? "";
}

function publicLocationDescription(sentence: string) {
  const match = sentence.match(/\bna\s+(?:ul\.?\s*)?(.+?)\s+v\s+Košiciach\b/i);
  return match?.[1]?.replace(/\s+/g, " ").trim() ?? "";
}

function resolutionEvidence(pageText: string) {
  const publicPart = pageText.split(/\bÚnia vzájomnej pomoci\b/i)[0] ?? pageText;
  const match = publicPart.match(/majiteľ[^.!?]{0,80}(?:zisten|dohľadan|prevzal|prevzala|vráten|vraten)[^.!?]{0,80}/i);
  return match?.[0]?.replace(/\s+/g, " ").trim().slice(0, 240) ?? "";
}

export const kosiceFoundDogDetailAdapter: ControlledHtmlAdapter = ({ html, source }) => {
  const detailUrl = supportedKosiceDetailUrl(source.sourceUrl);
  if (!detailUrl) return [];

  const title = heading(html);
  if (!title || title.length > 160 || !isDogHeading(title)) return [];
  if (/\bstraten/i.test(title)) return [];

  const pageText = textFromHtml(html);
  const sentence = reportSentence(pageText);
  if (!sentence) return [];

  const eventDate = explicitFoundEventDate(pageText);
  if (!eventDate) return [];

  const locationDescription = publicLocationDescription(sentence);
  const resolvedEvidence = resolutionEvidence(pageText);
  const proposed: Record<string, unknown> = {
    type: "FOUND",
    description: sentence,
    eventDate,
    city: "Košice",
    source: "Mesto Košice — Mestská polícia",
    sourceUrl: detailUrl,
  };
  if (locationDescription) proposed.locationDescription = locationDescription;

  return [{
    sourceRecordId: detailUrl.slice(0, 240),
    sourceUrl: detailUrl,
    sourceTimestamp: null,
    rawRecord: {
      title,
      reportSentence: sentence,
      eventDate,
      city: "Košice",
      locationDescription: locationDescription || null,
      resolvedSignal: Boolean(resolvedEvidence),
      resolvedEvidence: resolvedEvidence || null,
      detailUrl,
    },
    lifecycleSignals: resolvedEvidence
      ? [{ signalType: "LOST_FOUND_RESOLVED", targetState: "RESOLVED", evidenceText: resolvedEvidence, confidenceClass: "EXPLICIT" }]
      : undefined,
    proposed,
  } satisfies AutomationSourceRecord];
};
