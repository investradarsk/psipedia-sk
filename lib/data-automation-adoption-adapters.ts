import type { ControlledHtmlAdapter } from "./data-automation-connectors.ts";
import { canonicalizeSourceUrl, type AutomationSourceRecord } from "./data-automation.ts";

export const TRNAVA_ADOPTION_DETAIL_ADAPTER = "trnava-adoption-detail";

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

function supportedTrnavaDetailUrl(value: string | null) {
  const canonical = canonicalizeSourceUrl(value);
  if (!canonical) return null;
  try {
    const url = new URL(canonical);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "trnava.utulok.sk") return null;
    if (!/^\/psy\/[^/]+\/?$/.test(url.pathname)) return null;
    return canonical;
  } catch {
    return null;
  }
}

function heading(html: string) {
  const match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  return match ? textFromHtml(match[1]) : "";
}

const detailLabels = [
  "Pohlavie",
  "Vek",
  "Rasa",
  "Veľkosť",
  "Váha",
  "Farba",
  "Kastrácia",
  "Očkovaný",
  "Hendikep",
] as const;

function escaped(value: string) {
  return value.replace(/[.*+?^$()|[\]{}\\]/g, "\\$&");
}

function labelledValue(pageText: string, label: (typeof detailLabels)[number]) {
  const nextLabels = detailLabels.filter((item) => item !== label).map(escaped).join("|");
  const pattern = new RegExp(
    escaped(label) + "\\s*:\\s*(.+?)(?=\\s+(?:" + nextLabels + ")\\s*:|\\s+V prípade záujmu|$)",
    "i",
  );
  return pageText.match(pattern)?.[1]?.trim() ?? "";
}

function adoptionSex(value: string) {
  const normalized = value.toLocaleLowerCase("sk-SK").trim();
  if (/^(pes|samec)$/.test(normalized)) return "MALE";
  if (/^(fenka|samica)$/.test(normalized)) return "FEMALE";
  return null;
}

function approximateAgeMonths(value: string) {
  const normalized = value.toLocaleLowerCase("sk-SK");
  const years = normalized.match(/(\d+)\s*(?:rok|roky|rokov)\b/)?.[1];
  const months = normalized.match(/(\d+)\s*(?:mesiac|mesiace|mesiacov)\b/)?.[1];
  if (!years && !months) return null;
  return Number(years ?? 0) * 12 + Number(months ?? 0);
}

function weightKg(value: string) {
  const match = value.replace(",", ".").match(/(\d+(?:\.\d+)?)\s*(?:kg)?\b/i);
  if (!match) return null;
  const weight = Number(match[1]);
  return Number.isFinite(weight) && weight > 0 && weight < 150 ? weight : null;
}

export const trnavaAdoptionDetailAdapter: ControlledHtmlAdapter = ({ html, source }) => {
  const detailUrl = supportedTrnavaDetailUrl(source.sourceUrl);
  if (!detailUrl) return [];

  const name = heading(html);
  if (!name || name.length > 120) return [];

  const pageText = textFromHtml(html);
  const sexText = labelledValue(pageText, "Pohlavie");
  const sex = adoptionSex(sexText);
  const ageText = labelledValue(pageText, "Vek");
  const breed = labelledValue(pageText, "Rasa");
  const sizeText = labelledValue(pageText, "Veľkosť");
  const weightText = labelledValue(pageText, "Váha");
  const color = labelledValue(pageText, "Farba");
  const ageMonths = approximateAgeMonths(ageText);
  const weight = weightKg(weightText);
  const adoptedEvidence = pageText.match(/\bAdoptovan[ýáé]\b/i)?.[0] ?? "";
  const reservedEvidence = adoptedEvidence ? "" : pageText.match(/\bRezervovan[ýáé]\b/i)?.[0] ?? "";
  const adopted = Boolean(adoptedEvidence);
  const reserved = Boolean(reservedEvidence);

  const proposed: Record<string, unknown> = {
    name,
    organizationName: "Útulok Trnava",
    city: "Trnava",
    district: "Trnava",
    region: "Trnavský kraj",
    externalSourceUrl: detailUrl,
  };
  if (sex) proposed.sex = sex;
  if (ageMonths !== null) proposed.approximateAgeMonths = ageMonths;
  if (breed) proposed.breedName = breed;
  if (weight !== null) proposed.weight = weight;
  if (color) proposed.color = color;

  return [{
    sourceRecordId: detailUrl.slice(0, 240),
    sourceUrl: detailUrl,
    sourceTimestamp: null,
    rawRecord: {
      name,
      sex: sexText,
      age: ageText,
      breed,
      size: sizeText,
      weight: weightText,
      color,
      adopted,
      reserved,
      adoptedEvidence: adoptedEvidence || null,
      reservedEvidence: reservedEvidence || null,
      detailUrl,
    },
    lifecycleSignals: adopted
      ? [{ signalType: "ADOPTION_ADOPTED", targetState: "ADOPTED", evidenceText: adoptedEvidence, confidenceClass: "EXPLICIT" }]
      : reserved
        ? [{ signalType: "ADOPTION_RESERVED", targetState: "RESERVED", evidenceText: reservedEvidence, confidenceClass: "EXPLICIT" }]
        : undefined,
    proposed,
  } satisfies AutomationSourceRecord];
};
