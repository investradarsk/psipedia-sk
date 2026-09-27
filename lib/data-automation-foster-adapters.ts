import type { ControlledHtmlAdapter } from "./data-automation-connectors.ts";
import { canonicalizeSourceUrl, type AutomationSourceRecord } from "./data-automation.ts";

export const ZATULANE_PSIKY_SALA_FOSTER_DETAIL_ADAPTER = "zatulane-psiky-sala-foster-detail";
export const ZATULANE_PSIKY_SALA_FOSTER_SOURCE_SHAPE = "SINGLE_ITEM" as const;

const SOURCE_ORGANIZATION = "Zatúlané psíky Šaľa";
const ITEM_MODE_LABELS = new Set([
  "docasna opatera",
  "trvala adopcia",
  "virtualna adopcia",
  "urgentna pomoc",
  "domov na dozitie",
]);

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
      .replace(/<[^>]+>/g, " "),
  ).replace(/[ \t\f\v]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}

function normalizeLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("sk-SK")
    .replace(/\s+/g, " ")
    .trim();
}

function supportedDetailUrl(value: string | null) {
  const canonical = canonicalizeSourceUrl(value);
  if (!canonical) return null;
  try {
    const url = new URL(canonical);
    if (url.hostname !== "zatulanepsikysala.sk") return null;
    if (!/^\/pomoc\/[^/]+$/.test(url.pathname)) return null;
    return canonical;
  } catch {
    return null;
  }
}

function firstHeading(html: string) {
  const match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  return match ? textFromHtml(match[1]) : "";
}

function escaped(value: string) {
  return value.replace(/[.*+?^$()|[\]{}\\]/g, "\\$&");
}

function labelledListValue(html: string, label: string) {
  const pattern = new RegExp(
    "<h2\\b[^>]*>\\s*" + escaped(label) + "\\s*:?\\s*<\\/h2>([\\s\\S]*?)(?=<\\/li>)",
    "i",
  );
  const match = html.match(pattern);
  return match ? textFromHtml(match[1]) : "";
}

function paragraphTexts(html: string) {
  return [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => textFromHtml(match[1]))
    .filter(Boolean);
}

function supportModes(html: string) {
  for (const paragraph of paragraphTexts(html)) {
    const parts = paragraph.split(",").map((part) => part.trim()).filter(Boolean);
    if (!parts.length) continue;
    const normalized = parts.map(normalizeLabel);
    if (!normalized.includes("docasna opatera")) continue;
    if (!normalized.every((item) => ITEM_MODE_LABELS.has(item))) continue;
    return parts;
  }
  return [];
}

function descriptionFromPage(html: string) {
  const excluded = /(?:chcem sa dozvedieť|chcete sa dozvedieť|virtuálna adopcia|dočasná opatera|trvalá adopcia|pre podporovateľov|problem was detected|copyright)/i;
  const paragraphs = paragraphTexts(html)
    .filter((paragraph) => paragraph.length >= 80 && !excluded.test(paragraph))
    .slice(0, 3);
  return paragraphs.join("\n\n").slice(0, 5000);
}

function cleanedDogName(heading: string) {
  return heading
    .replace(/\s+[–—-]\s+adoptovan[ýá]\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function explicitResolvedSignal(heading: string) {
  return /(?:^|\s|[–—-])adoptovan[ýá](?:\s|$)/i.test(heading);
}

function explicitUrgentSignal(modes: string[]) {
  return modes.some((mode) => normalizeLabel(mode) === "urgentna pomoc");
}

export const zatulanePsikySalaFosterDetailAdapter: ControlledHtmlAdapter = ({ html, source }) => {
  const detailUrl = supportedDetailUrl(source.sourceUrl);
  if (!detailUrl || !html.trim()) return [];

  const sourceHeading = firstHeading(html);
  const dogName = cleanedDogName(sourceHeading);
  if (!sourceHeading || !dogName || dogName.length > 120) return [];

  const modes = supportModes(html);
  if (!modes.length) return [];

  const pageText = textFromHtml(html);
  const breed = labelledListValue(html, "Plemeno");
  const ageNote = labelledListValue(html, "Vek");
  const birthDate = labelledListValue(html, "Dátum narodenia");
  const shelterSince = labelledListValue(html, "V útulku od");
  const description = descriptionFromPage(html);
  const organization = pageText.includes(SOURCE_ORGANIZATION) ? SOURCE_ORGANIZATION : "";
  const urgent = explicitUrgentSignal(modes);
  const resolved = explicitResolvedSignal(sourceHeading);

  const proposed: Record<string, unknown> = {
    title: sourceHeading,
    dogName,
    actionUrl: detailUrl,
  };
  if (organization) proposed.organization = organization;
  if (breed) proposed.breed = breed;
  if (ageNote) proposed.ageNote = ageNote;
  if (description) proposed.description = description;
  if (urgent) proposed.urgent = true;
  if (resolved) proposed.resolved = true;

  return [{
    sourceRecordId: detailUrl,
    sourceUrl: detailUrl,
    sourceTimestamp: null,
    rawRecord: {
      title: sourceHeading,
      dogName,
      organization: organization || null,
      breed: breed || null,
      age: ageNote || null,
      birthDate: birthDate || null,
      shelterSince: shelterSince || null,
      supportModes: modes,
      description: description || null,
      urgent,
      resolved,
      detailUrl,
    },
    proposed,
  } satisfies AutomationSourceRecord];
};
