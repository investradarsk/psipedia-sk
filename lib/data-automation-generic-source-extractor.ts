import {
  canonicalizeSourceUrl,
  isSafeAutomationSourceUrl,
  sha256Hex,
  stableJson,
  type AutomationExtractionCoverage,
  type AutomationSource,
  type AutomationSourceRecord,
} from "./data-automation.ts";
import {
  automationUrlWithinApprovedSourceScope,
  type SourceScopedExtractionContract,
} from "./data-automation-source-scoped-extraction.ts";

export const genericFirstPartyErrorCodes = [
  "no_items_discovered",
  "source_scope_violation",
  "ambiguous_listing",
  "unsupported_structured_data",
  "traversal_limit_reached",
  "detail_fetch_failed",
  "unsafe_item_url",
  "invalid_item_structure",
] as const;
export type GenericFirstPartyErrorCode = (typeof genericFirstPartyErrorCodes)[number];

export class GenericFirstPartyExtractionError extends Error {
  readonly code: GenericFirstPartyErrorCode;

  constructor(code: GenericFirstPartyErrorCode) {
    super(code);
    this.name = "GenericFirstPartyExtractionError";
    this.code = code;
  }
}

export type GenericFirstPartyFetchPage = (url: string) => Promise<{
  html: string;
  finalUrl: string;
}>;

export type GenericFirstPartyExtractionDiagnostics = {
  sourceShape: "SINGLE_ITEM" | "MULTI_ITEM_LIST";
  visitedListingPages: number;
  discoveredItemUrls: number;
  detailFetches: number;
  rejectedUrls: number;
  malformedStructuredBlocks: number;
  warnings: GenericFirstPartyErrorCode[];
};

export type GenericFirstPartyExtractionResult = {
  records: AutomationSourceRecord[];
  coverage: AutomationExtractionCoverage;
  diagnostics: GenericFirstPartyExtractionDiagnostics;
};

type JsonLdNode = Record<string, unknown>;

const GENERIC_STRUCTURED_TYPES = new Set([
  "Event",
  "Organization",
  "LocalBusiness",
  "VeterinaryCare",
  "ProfessionalService",
  "AnimalShelter",
  "PetStore",
  "Product",
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
      .replace(/<br\s*\/?\s*>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  ).replace(/\s+/g, " ").trim();
}

function boundedText(value: unknown, max = 2000) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).normalize("NFC").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : null;
}

function boundedStructuredValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return null;
  if (typeof value === "string") return value.slice(0, 2000);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => boundedStructuredValue(item, depth + 1));
  if (!value || typeof value !== "object") return null;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
    output[key.slice(0, 120)] = boundedStructuredValue(item, depth + 1);
  }
  return output;
}

function jsonLdNodes(html: string) {
  const nodes: JsonLdNode[] = [];
  let scriptCount = 0;
  let malformed = 0;
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    scriptCount += 1;
    let parsed: unknown;
    try {
      parsed = JSON.parse(decodeHtml(match[1]).trim());
    } catch {
      malformed += 1;
      continue;
    }
    const push = (value: unknown) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return;
      const node = value as JsonLdNode;
      nodes.push(node);
      if (Array.isArray(node["@graph"])) node["@graph"].slice(0, 80).forEach(push);
    };
    if (Array.isArray(parsed)) parsed.slice(0, 80).forEach(push);
    else push(parsed);
    if (nodes.length >= 120) break;
  }
  return { nodes: nodes.slice(0, 120), scriptCount, malformed };
}

function schemaTypes(node: JsonLdNode) {
  const raw = node["@type"];
  return (Array.isArray(raw) ? raw : [raw])
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}

function hasSchemaType(node: JsonLdNode, type: string) {
  return schemaTypes(node).includes(type);
}

function isGenericStructuredItem(node: JsonLdNode) {
  return schemaTypes(node).some((type) => GENERIC_STRUCTURED_TYPES.has(type));
}

function scopeUrl(
  raw: unknown,
  baseUrl: string,
  contract: SourceScopedExtractionContract,
) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  if (/^(?:mailto|tel|javascript|data):/i.test(raw.trim()) || raw.trim().startsWith("#")) return null;
  let absolute: string;
  try {
    absolute = new URL(decodeHtml(raw.trim()), baseUrl).toString();
  } catch {
    return null;
  }
  const canonical = canonicalizeSourceUrl(absolute);
  if (!canonical || !isSafeAutomationSourceUrl(canonical)) return null;
  if (!automationUrlWithinApprovedSourceScope(contract.identity, canonical)) return null;
  return canonical;
}

function nodeUrl(node: JsonLdNode, baseUrl: string, contract: SourceScopedExtractionContract) {
  for (const value of [node.url, node["@id"]]) {
    const url = scopeUrl(value, baseUrl, contract);
    if (url) return url;
  }
  return null;
}

function namedValue(value: unknown) {
  if (typeof value === "string") return boundedText(value, 500);
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const object = value as Record<string, unknown>;
  return boundedText(object.name ?? object.title ?? object.value, 500);
}

function explicitIdentifier(node: JsonLdNode) {
  const raw = node.identifier;
  if (typeof raw === "string" || typeof raw === "number") return boundedText(raw, 240);
  const values = Array.isArray(raw) ? raw : [raw];
  for (const value of values) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const object = value as Record<string, unknown>;
    const candidate = boundedText(object.value ?? object["@value"] ?? object.propertyID ?? object.name, 240);
    if (candidate) return candidate;
  }
  const id = boundedText(node["@id"], 240);
  return id && !/^https?:\/\//i.test(id) ? id : null;
}

function publicEvidenceUrl(raw: unknown, baseUrl: string) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let absolute: string;
  try {
    absolute = new URL(decodeHtml(raw.trim()), baseUrl).toString();
  } catch {
    return null;
  }
  const canonical = canonicalizeSourceUrl(absolute);
  return canonical && isSafeAutomationSourceUrl(canonical) ? canonical : null;
}

function imageUrl(value: unknown, baseUrl: string) {
  const values = Array.isArray(value) ? value : [value];
  for (const item of values) {
    const raw = typeof item === "string"
      ? item
      : item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>).url ?? (item as Record<string, unknown>).contentUrl
        : null;
    const url = publicEvidenceUrl(raw, baseUrl);
    if (url) return url;
  }
  return null;
}

function postalAddress(value: unknown) {
  if (typeof value === "string") {
    const address = boundedText(value, 700);
    return address ? { address } : {};
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const object = value as Record<string, unknown>;
  const street = boundedText(object.streetAddress, 300);
  const city = boundedText(object.addressLocality, 200);
  const region = boundedText(object.addressRegion, 200);
  const postalCode = boundedText(object.postalCode, 40);
  const country = typeof object.addressCountry === "string"
    ? boundedText(object.addressCountry, 100)
    : namedValue(object.addressCountry);
  const address = [street, city, postalCode, region, country].filter(Boolean).join(", ");
  return {
    ...(street ? { street } : {}),
    ...(city ? { city } : {}),
    ...(region ? { region } : {}),
    ...(postalCode ? { postalCode } : {}),
    ...(country ? { country } : {}),
    ...(address ? { address } : {}),
  };
}

function nodeProposal(
  node: JsonLdNode,
  itemUrl: string | null,
  baseUrl: string,
  contract: SourceScopedExtractionContract,
) {
  const name = boundedText(node.name ?? node.headline, 500);
  const description = boundedText(node.description, 5000);
  const startDate = boundedText(node.startDate ?? node.datePublished, 120);
  const endDate = boundedText(node.endDate, 120);
  const modified = boundedText(node.dateModified ?? node.updated, 120);
  const organizer = namedValue(node.organizer);
  const provider = namedValue(node.provider);
  const author = namedValue(node.author);
  const locationName = namedValue(node.location);
  const locationAddress = node.location && typeof node.location === "object" && !Array.isArray(node.location)
    ? postalAddress((node.location as Record<string, unknown>).address)
    : {};
  const directAddress = postalAddress(node.address);
  const status = boundedText(node.eventStatus ?? node.status, 300);
  const externalId = explicitIdentifier(node);
  const image = imageUrl(node.image, baseUrl);
  const types = schemaTypes(node);

  const proposed: Record<string, unknown> = {};
  if (name) {
    proposed.name = name;
    proposed.title = name;
  }
  if (description) proposed.description = description;
  if (itemUrl) proposed.websiteUrl = itemUrl;
  if (externalId) proposed.externalId = externalId;
  if (startDate) proposed.startDate = startDate;
  if (endDate) proposed.endDate = endDate;
  if (modified) proposed.updatedAt = modified;
  if (organizer) proposed.organizer = organizer;
  if (provider) proposed.provider = provider;
  if (author) proposed.author = author;
  if (locationName) proposed.location = locationName;
  Object.assign(proposed, Object.keys(locationAddress).length ? locationAddress : directAddress);
  if (status) proposed.status = status;
  if (image) proposed.imageUrl = image;
  if (types.length) proposed.structuredType = types;

  return {
    proposed,
    externalId,
    sourceTimestamp: modified,
    schemaTypes: types,
  };
}

async function sourceRecordId(input: {
  externalId: string | null;
  itemUrl: string | null;
  sourceRoot: string;
  proposed: Record<string, unknown>;
  schemaTypes: string[];
}) {
  if (input.externalId) {
    const normalized = input.externalId.replace(/\s+/g, " ").trim();
    if (normalized.length <= 220) return "id:" + normalized;
    return "id:" + await sha256Hex(normalized);
  }
  if (input.itemUrl) return "url:" + await sha256Hex(input.itemUrl);
  return "fp:" + await sha256Hex({
    sourceRoot: input.sourceRoot,
    schemaTypes: input.schemaTypes,
    name: input.proposed.name ?? input.proposed.title ?? null,
    startDate: input.proposed.startDate ?? null,
    location: input.proposed.location ?? input.proposed.address ?? null,
    externalId: input.proposed.externalId ?? null,
  });
}

async function recordFromNode(input: {
  node: JsonLdNode;
  pageUrl: string;
  itemUrl?: string | null;
  source: AutomationSource;
  contract: SourceScopedExtractionContract;
  discoveryMethod: string;
  detailFetched: boolean;
  pageTextExcerpt?: string | null;
}) {
  const itemUrl = input.itemUrl ?? nodeUrl(input.node, input.pageUrl, input.contract);
  const mapped = nodeProposal(input.node, itemUrl, input.pageUrl, input.contract);
  if (!mapped.proposed.name && !mapped.proposed.title && !mapped.externalId && !itemUrl) return null;
  const id = await sourceRecordId({
    externalId: mapped.externalId,
    itemUrl,
    sourceRoot: input.contract.identity.canonicalSourceRootUrl,
    proposed: mapped.proposed,
    schemaTypes: mapped.schemaTypes,
  });
  return {
    sourceRecordId: id,
    sourceUrl: itemUrl ?? input.pageUrl,
    sourceTimestamp: mapped.sourceTimestamp,
    rawRecord: {
      schemaTypes: mapped.schemaTypes,
      structured: boundedStructuredValue(input.node),
      pageUrl: input.pageUrl,
      ...(input.pageTextExcerpt ? { pageTextExcerpt: input.pageTextExcerpt.slice(0, 10_000) } : {}),
    },
    proposed: mapped.proposed,
    extraction: {
      itemUrl,
      externalId: mapped.externalId,
      discoveredFromRoot: input.contract.identity.canonicalSourceRootUrl,
      strategy: "GENERIC_FIRST_PARTY" as const,
      evidenceMetadata: {
        discoveryMethod: input.discoveryMethod,
        pageUrl: input.pageUrl,
        detailFetched: input.detailFetched,
        schemaTypes: mapped.schemaTypes,
      },
      coverage: {
        classification: "UNKNOWN" as const,
        complete: false,
      },
      confidence: "HIGH" as const,
    },
  } satisfies AutomationSourceRecord;
}

function itemListNode(nodes: JsonLdNode[], pageUrl: string, contract: SourceScopedExtractionContract) {
  const lists = nodes.filter((node) => hasSchemaType(node, "ItemList"));
  if (lists.length <= 1) return lists[0] ?? null;
  const exact = lists.filter((node) => nodeUrl(node, pageUrl, contract) === canonicalizeSourceUrl(pageUrl));
  if (exact.length === 1) return exact[0];
  throw new GenericFirstPartyExtractionError("ambiguous_listing");
}

function itemListElements(node: JsonLdNode) {
  return Array.isArray(node.itemListElement) ? node.itemListElement.slice(0, 1000) : [];
}

function itemListExpectedCount(node: JsonLdNode) {
  const count = Number(node.numberOfItems);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

function itemListEntry(value: unknown) {
  if (typeof value === "string") return { node: null, urlValue: value };
  if (!value || typeof value !== "object" || Array.isArray(value)) return { node: null, urlValue: null };
  const object = value as Record<string, unknown>;
  const nested = object.item;
  if (typeof nested === "string") return { node: null, urlValue: nested };
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const node = nested as JsonLdNode;
    return { node, urlValue: node.url ?? node["@id"] ?? object.url ?? null };
  }
  return {
    node: isGenericStructuredItem(object) ? object : null,
    urlValue: object.url ?? object["@id"] ?? null,
  };
}

function explicitNextUrl(html: string, pageUrl: string, contract: SourceScopedExtractionContract) {
  const candidates: string[] = [];
  for (const match of html.matchAll(/<(?:link|a)\b([^>]*)>/gi)) {
    const attrs = match[1];
    const rel = attrs.match(/\brel\s*=\s*["']([^"']+)["']/i)?.[1] ?? "";
    if (!rel.split(/\s+/).some((value) => value.toLowerCase() === "next")) continue;
    const href = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1] ?? "";
    if (href) candidates.push(href);
  }
  const unique = [...new Set(candidates)];
  if (!unique.length) return null;
  if (unique.length > 1) throw new GenericFirstPartyExtractionError("ambiguous_listing");
  const next = scopeUrl(unique[0], pageUrl, contract);
  if (!next) throw new GenericFirstPartyExtractionError("source_scope_violation");
  return next;
}

function qualifiedHtmlLinks(html: string, pageUrl: string, contract: SourceScopedExtractionContract) {
  const candidates = new Map<string, number>();
  let rejected = 0;
  const root = new URL(contract.identity.canonicalSourceRootUrl);
  const pageCanonical = canonicalizeSourceUrl(pageUrl);

  for (const match of html.matchAll(/<a\b([^>]*)\bhref\s*=\s*["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = (match[1] + " " + match[3]).slice(0, 1200);
    const href = match[2];
    const text = textFromHtml(match[4]).slice(0, 300);
    const rawIndex = match.index ?? 0;
    const context = html.slice(Math.max(0, rawIndex - 300), Math.min(html.length, rawIndex + match[0].length + 120));
    const rel = attrs.match(/\brel\s*=\s*["']([^"']+)["']/i)?.[1] ?? "";
    if (/\bnext\b/i.test(rel)) continue;
    const url = scopeUrl(href, pageUrl, contract);
    if (!url || url === pageCanonical) {
      if (href && !/^(?:#|mailto:|tel:|javascript:)/i.test(href.trim())) rejected += 1;
      continue;
    }

    let score = 0;
    if (/\bitemprop\s*=\s*["'][^"']*\burl\b/i.test(attrs)) score += 3;
    if (/itemtype\s*=\s*["'][^"']*(?:Event|Product|Organization|LocalBusiness|AnimalShelter)/i.test(context)) score += 3;
    if (/<article\b/i.test(context)) score += 2;
    if (/\b(?:class|id)\s*=\s*["'][^"']*(?:card|listing|result|event|dog|pes|adop|foster|docas|lost|found|straten|najden|post|entry|profile)[^"']*["']/i.test(context)) score += 2;
    if (/\bclass\s*=\s*["'][^"']*(?:detail|title|name|event|dog|card|entry)[^"']*["']/i.test(attrs)) score += 2;
    if (text.length >= 2 && text.length <= 200) score += 1;

    const target = new URL(url);
    const rootPath = root.pathname.endsWith("/") ? root.pathname : root.pathname + "/";
    if (target.pathname.startsWith(rootPath) && target.pathname !== root.pathname) score += 1;

    if (score >= 4) candidates.set(url, Math.max(score, candidates.get(url) ?? 0));
  }

  return {
    urls: [...candidates.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([url]) => url),
    rejected,
  };
}

function htmlDetailEvidence(html: string, pageUrl: string, contract: SourceScopedExtractionContract) {
  const h1 = textFromHtml(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "").slice(0, 500);
  if (!h1) return null;
  const canonicalHref = html.match(/<link\b[^>]*rel\s*=\s*["'][^"']*canonical[^"']*["'][^>]*href\s*=\s*["']([^"']+)["'][^>]*>/i)?.[1]
    ?? html.match(/<link\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["'][^"']*canonical[^"']*["'][^>]*>/i)?.[1]
    ?? null;
  const canonical = canonicalHref ? scopeUrl(canonicalHref, pageUrl, contract) : canonicalizeSourceUrl(pageUrl);
  if (!canonical || canonical !== canonicalizeSourceUrl(pageUrl)) return null;
  const metaDescription = decodeHtml(
    html.match(/<meta\b[^>]*name\s*=\s*["']description["'][^>]*content\s*=\s*["']([^"']*)["'][^>]*>/i)?.[1] ?? "",
  ).replace(/\s+/g, " ").trim().slice(0, 5000);
  const dateTime = html.match(/<time\b[^>]*datetime\s*=\s*["']([^"']+)["'][^>]*>/i)?.[1]?.trim() ?? null;
  const image = html.match(/<meta\b[^>]*property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*>/i)?.[1] ?? null;
  const scopedImage = image ? publicEvidenceUrl(image, pageUrl) : null;
  return {
    node: {
      "@type": "Product",
      name: h1,
      url: canonical,
      ...(metaDescription ? { description: metaDescription } : {}),
      ...(dateTime ? { datePublished: dateTime } : {}),
      ...(scopedImage ? { image: scopedImage } : {}),
    } satisfies JsonLdNode,
    canonical,
  };
}

function normalizedAdoptionHeading(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("sk-SK")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function adoptionHtmlDetailEvidence(html: string, pageUrl: string, contract: SourceScopedExtractionContract) {
  const h1 = textFromHtml(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "").slice(0, 160);
  if (!h1) return null;
  const heading = normalizedAdoptionHeading(h1);
  if (/^(?:psy? na adopciu|adopcia|hladame domov|adoptujte psika|nasi zverenci|psy? hladaju domov)$/.test(heading)) {
    return null;
  }

  const text = textFromHtml(html).slice(0, 10_000);
  const dogSignals = [
    /(?:^|\s)pohlavie\s*[:–—-]/i,
    /(?:^|\s)vek\s*[:–—-]/i,
    /(?:^|\s)(?:plemeno|rasa)\s*[:–—-]/i,
    /(?:^|\s)ve[lľ]kos[tť]\s*[:–—-]/i,
    /(?:^|\s)(?:v[aá]ha|hmotnos[tť])\s*[:–—-]/i,
    /(?:^|\s)farba\s*[:–—-]/i,
    /(?:^|\s)d[aá]tum\s+narodenia\s*[:–—-]/i,
  ].filter((pattern) => pattern.test(text)).length;
  if (dogSignals < 2) return null;

  const canonicalHref = html.match(/<link\b[^>]*rel\s*=\s*["'][^"']*canonical[^"']*["'][^>]*href\s*=\s*["']([^"']+)["'][^>]*>/i)?.[1]
    ?? html.match(/<link\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["'][^"']*canonical[^"']*["'][^>]*>/i)?.[1]
    ?? null;
  const canonical = canonicalHref ? scopeUrl(canonicalHref, pageUrl, contract) : canonicalizeSourceUrl(pageUrl);
  if (!canonical || canonical !== canonicalizeSourceUrl(pageUrl)) return null;
  const description = decodeHtml(
    html.match(/<meta\b[^>]*name\s*=\s*["']description["'][^>]*content\s*=\s*["']([^"']*)["'][^>]*>/i)?.[1] ?? "",
  ).replace(/\s+/g, " ").trim().slice(0, 5000);
  return { name: h1, canonical, description, pageTextExcerpt: text };
}

async function adoptionRecordFromHtmlDetail(input: {
  html: string;
  pageUrl: string;
  source: AutomationSource;
  contract: SourceScopedExtractionContract;
  discoveryMethod: string;
  detailFetched: boolean;
}) {
  const evidence = adoptionHtmlDetailEvidence(input.html, input.pageUrl, input.contract);
  if (!evidence) return null;
  const proposed: Record<string, unknown> = {
    name: evidence.name,
    websiteUrl: evidence.canonical,
    ...(evidence.description ? { description: evidence.description } : {}),
  };
  const id = await sourceRecordId({
    externalId: null,
    itemUrl: evidence.canonical,
    sourceRoot: input.contract.identity.canonicalSourceRootUrl,
    proposed,
    schemaTypes: [],
  });
  return {
    sourceRecordId: id,
    sourceUrl: evidence.canonical,
    sourceTimestamp: null,
    rawRecord: {
      pageUrl: input.pageUrl,
      pageTextExcerpt: evidence.pageTextExcerpt,
    },
    proposed,
    extraction: {
      itemUrl: evidence.canonical,
      externalId: null,
      discoveredFromRoot: input.contract.identity.canonicalSourceRootUrl,
      strategy: "GENERIC_FIRST_PARTY" as const,
      evidenceMetadata: {
        discoveryMethod: input.discoveryMethod,
        pageUrl: input.pageUrl,
        detailFetched: input.detailFetched,
        adoptionDetailEvidence: true,
      },
      coverage: {
        classification: "UNKNOWN" as const,
        complete: false,
      },
      confidence: "HIGH" as const,
    },
  } satisfies AutomationSourceRecord;
}


function fosterHtmlDetailEvidence(
  html: string,
  pageUrl: string,
  source: AutomationSource,
  contract: SourceScopedExtractionContract,
) {
  const h1 = textFromHtml(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "").slice(0, 300);
  if (!h1) return null;
  const heading = normalizedAdoptionHeading(h1);
  if (/^(?:docasna opatera|hladame docasku|hladame docasnu opateru|potrebujeme docasku|urgentne potrebujeme docasku|pomozte nam docasna opatera)$/.test(heading)) {
    return null;
  }

  const text = textFromHtml(html).slice(0, 10_000);
  const fosterSemantic = /(?:do[cč]asn[aá]\s+opatera|do[cč]ask[auy]|temporary\s+foster)/i.test(text);
  if (!fosterSemantic) return null;

  const caseSignals = [
    /(?:^|\s)(?:meno|ps[ií]k|pes|fenka)\s*[:–—-]/i,
    /(?:^|\s)(?:plemeno|rasa)\s*[:–—-]/i,
    /(?:^|\s)vek\s*[:–—-]/i,
    /(?:^|\s)mesto\s*[:–—-]/i,
    /(?:^|\s)(?:kraj|regi[oó]n)\s*[:–—-]/i,
    /(?:^|\s)(?:lokalita|miesto)\s*[:–—-]/i,
    /(?:^|\s)(?:urgentn[eé]|s[uú]rne)\s*[:–—-]/i,
    /(?:^|\s)kontakt\s*[:–—-]/i,
  ].filter((pattern) => pattern.test(text)).length;
  if (caseSignals < 2) return null;

  const sourceOrganization = typeof source.config.staticFields?.organizationName === "string"
    ? source.config.staticFields.organizationName.trim()
    : "";
  const labelledOrganization = /(?:^|\s)(?:organiz[aá]cia|[uú]tulok|oz)\s*[:–—-]\s*\S+/i.test(text);
  if (!sourceOrganization && !labelledOrganization) return null;

  const canonicalHref = html.match(/<link\b[^>]*rel\s*=\s*["'][^"']*canonical[^"']*["'][^>]*href\s*=\s*["']([^"']+)["'][^>]*>/i)?.[1]
    ?? html.match(/<link\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["'][^"']*canonical[^"']*["'][^>]*>/i)?.[1]
    ?? null;
  const canonical = canonicalHref ? scopeUrl(canonicalHref, pageUrl, contract) : canonicalizeSourceUrl(pageUrl);
  if (!canonical || canonical !== canonicalizeSourceUrl(pageUrl)) return null;

  const description = decodeHtml(
    html.match(/<meta\b[^>]*name\s*=\s*["']description["'][^>]*content\s*=\s*["']([^"']*)["'][^>]*>/i)?.[1] ?? "",
  ).replace(/\s+/g, " ").trim().slice(0, 5000);
  return { title: h1, canonical, description, pageTextExcerpt: text };
}

async function fosterRecordFromHtmlDetail(input: {
  html: string;
  pageUrl: string;
  source: AutomationSource;
  contract: SourceScopedExtractionContract;
  discoveryMethod: string;
  detailFetched: boolean;
}) {
  const evidence = fosterHtmlDetailEvidence(input.html, input.pageUrl, input.source, input.contract);
  if (!evidence) return null;
  const proposed: Record<string, unknown> = {
    title: evidence.title,
    actionUrl: evidence.canonical,
    ...(evidence.description ? { description: evidence.description } : {}),
  };
  const id = await sourceRecordId({
    externalId: null,
    itemUrl: evidence.canonical,
    sourceRoot: input.contract.identity.canonicalSourceRootUrl,
    proposed,
    schemaTypes: [],
  });
  return {
    sourceRecordId: id,
    sourceUrl: evidence.canonical,
    sourceTimestamp: null,
    rawRecord: {
      pageUrl: input.pageUrl,
      pageTextExcerpt: evidence.pageTextExcerpt,
    },
    proposed,
    extraction: {
      itemUrl: evidence.canonical,
      externalId: null,
      discoveredFromRoot: input.contract.identity.canonicalSourceRootUrl,
      strategy: "GENERIC_FIRST_PARTY" as const,
      evidenceMetadata: {
        discoveryMethod: input.discoveryMethod,
        pageUrl: input.pageUrl,
        detailFetched: input.detailFetched,
        fosterDetailEvidence: true,
      },
      coverage: {
        classification: "UNKNOWN" as const,
        complete: false,
      },
      confidence: "HIGH" as const,
    },
  } satisfies AutomationSourceRecord;
}

function lostFoundHtmlDetailEvidence(
  html: string,
  pageUrl: string,
  source: AutomationSource,
  contract: SourceScopedExtractionContract,
) {
  const h1 = textFromHtml(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "").slice(0, 300);
  if (!h1) return null;
  const heading = normalizedAdoptionHeading(h1);
  if (/^(?:stratene\s+a\s+najdene\s+psy|stratene\s+psy|najdene\s+psy|lost\s+and\s+found\s+dogs)$/.test(heading)) {
    return null;
  }

  const text = textFromHtml(html).slice(0, 10_000);
  const normalized = normalizedAdoptionHeading(text);
  const lost = /(?:^|\s)(?:strateny\s+pes|stratena\s+fenka|pes\s+sa\s+stratil|fenka\s+sa\s+stratila|nezvestny\s+pes|nezvestna\s+fenka)(?:\s|$)/.test(normalized);
  const found = /(?:^|\s)(?:najdeny\s+pes|najdena\s+fenka|pes\s+bol\s+najdeny|fenka\s+bola\s+najdena)(?:\s|$)/.test(normalized);
  const staticType = source.config.staticFields?.type === "LOST" || source.config.staticFields?.type === "FOUND"
    ? source.config.staticFields.type
    : null;
  if ((lost && found) || (!lost && !found && !staticType)) return null;
  if (staticType === "LOST" && found) return null;
  if (staticType === "FOUND" && lost) return null;

  const incidentDate = /(?:d[aá]tum\s+(?:n[aá]lezu|straty|incidentu|udalosti)|incident\s+date|date\s+(?:lost|found))\s*[:–—-]\s*(?:\d{1,2}\.\s*\d{1,2}\.\s*\d{4}|\d{4}-\d{2}-\d{2})/i.test(text)
    || /(?:d[nň]a\s*)?(?:\d{1,2}\.\s*\d{1,2}\.\s*\d{4}|\d{4}-\d{2}-\d{2}).{0,160}(?:stratil|stratila|straten|nezvestn|bol\s+n[aá]jden|bola\s+n[aá]jden)/i.test(text);
  if (!incidentDate) return null;

  const locality = /(?:^|\s)(?:mesto|okres|kraj|regi[oó]n|lokalita|miesto\s+(?:straty|n[aá]lezu)|city|district|region|location)\s*[:–—-]\s*\S+/i.test(text);
  if (!locality) return null;

  const dogSignals = [
    /(?:^|\s)(?:meno|dog\s+name)\s*[:–—-]\s*\S+/i,
    /(?:^|\s)(?:pohlavie|sex|gender)\s*[:–—-]\s*\S+/i,
    /(?:^|\s)(?:plemeno|rasa|breed)\s*[:–—-]\s*\S+/i,
    /(?:^|\s)(?:farba|color|colour)\s*[:–—-]\s*\S+/i,
    /(?:^|\s)(?:vek|age)\s*[:–—-]\s*\S+/i,
    /(?:^|\s)(?:ve[lľ]kos[tť]|size)\s*[:–—-]\s*\S+/i,
  ].filter((pattern) => pattern.test(text)).length;
  if (dogSignals < 1) return null;

  const canonicalHref = html.match(/<link\b[^>]*rel\s*=\s*["'][^"']*canonical[^"']*["'][^>]*href\s*=\s*["']([^"']+)["'][^>]*>/i)?.[1]
    ?? html.match(/<link\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["'][^"']*canonical[^"']*["'][^>]*>/i)?.[1]
    ?? null;
  const canonical = canonicalHref ? scopeUrl(canonicalHref, pageUrl, contract) : canonicalizeSourceUrl(pageUrl);
  if (!canonical || canonical !== canonicalizeSourceUrl(pageUrl)) return null;

  const description = decodeHtml(
    html.match(/<meta\b[^>]*name\s*=\s*["']description["'][^>]*content\s*=\s*["']([^"']*)["'][^>]*>/i)?.[1] ?? "",
  ).replace(/\s+/g, " ").trim().slice(0, 5000);
  return { title: h1, canonical, description, pageTextExcerpt: text };
}

async function lostFoundRecordFromHtmlDetail(input: {
  html: string;
  pageUrl: string;
  source: AutomationSource;
  contract: SourceScopedExtractionContract;
  discoveryMethod: string;
  detailFetched: boolean;
}) {
  const evidence = lostFoundHtmlDetailEvidence(input.html, input.pageUrl, input.source, input.contract);
  if (!evidence) return null;
  const proposed: Record<string, unknown> = {
    sourceUrl: evidence.canonical,
    ...(evidence.description ? { description: evidence.description } : {}),
  };
  const id = await sourceRecordId({
    externalId: null,
    itemUrl: evidence.canonical,
    sourceRoot: input.contract.identity.canonicalSourceRootUrl,
    proposed,
    schemaTypes: [],
  });
  return {
    sourceRecordId: id,
    sourceUrl: evidence.canonical,
    sourceTimestamp: null,
    rawRecord: {
      pageUrl: input.pageUrl,
      title: evidence.title,
      pageTextExcerpt: evidence.pageTextExcerpt,
    },
    proposed,
    extraction: {
      itemUrl: evidence.canonical,
      externalId: null,
      discoveredFromRoot: input.contract.identity.canonicalSourceRootUrl,
      strategy: "GENERIC_FIRST_PARTY" as const,
      evidenceMetadata: {
        discoveryMethod: input.discoveryMethod,
        pageUrl: input.pageUrl,
        detailFetched: input.detailFetched,
        lostFoundDetailEvidence: true,
      },
      coverage: {
        classification: "UNKNOWN" as const,
        complete: false,
      },
      confidence: "HIGH" as const,
    },
  } satisfies AutomationSourceRecord;
}

function recordIdentityKey(record: AutomationSourceRecord) {
  return record.sourceUrl ? "url:" + record.sourceUrl : "id:" + record.sourceRecordId;
}

function withCoverage(
  record: AutomationSourceRecord,
  coverage: AutomationExtractionCoverage,
): AutomationSourceRecord {
  return {
    ...record,
    extraction: record.extraction
      ? { ...record.extraction, coverage }
      : undefined,
  };
}

export function genericFirstPartyProbeContract(contract: SourceScopedExtractionContract): SourceScopedExtractionContract {
  return {
    ...contract,
    limits: {
      ...contract.limits,
      maxPages: Math.min(contract.limits.maxPages, 2),
      maxItems: Math.min(contract.limits.maxItems, 5),
    },
  };
}

export async function extractGenericFirstPartySource(input: {
  source: AutomationSource;
  contract: SourceScopedExtractionContract;
  rootHtml: string;
  rootUrl: string;
  fetchPage: GenericFirstPartyFetchPage;
}): Promise<GenericFirstPartyExtractionResult> {
  const rootUrl = canonicalizeSourceUrl(input.rootUrl);
  if (!rootUrl || !automationUrlWithinApprovedSourceScope(input.contract.identity, rootUrl)) {
    throw new GenericFirstPartyExtractionError("source_scope_violation");
  }

  const records = new Map<string, AutomationSourceRecord>();
  const itemUrls = new Set<string>();
  const listingQueue: Array<{ url: string; html: string }> = [{ url: rootUrl, html: input.rootHtml }];
  const visitedListings = new Set<string>();
  const warnings = new Set<GenericFirstPartyErrorCode>();
  let rejectedUrls = 0;
  let malformedStructuredBlocks = 0;
  let detailFetches = 0;
  let truncated = false;
  let explicitCompleteEnumeration = false;
  let explicitExpectedItems: number | null = null;
  let sourceShape: "SINGLE_ITEM" | "MULTI_ITEM_LIST" = "MULTI_ITEM_LIST";
  let detailFailureCount = 0;

  while (listingQueue.length) {
    if (visitedListings.size >= input.contract.limits.maxPages) {
      truncated = true;
      warnings.add("traversal_limit_reached");
      break;
    }
    const page = listingQueue.shift()!;
    const pageUrl = canonicalizeSourceUrl(page.url);
    if (!pageUrl || visitedListings.has(pageUrl)) continue;
    if (!automationUrlWithinApprovedSourceScope(input.contract.identity, pageUrl)) {
      throw new GenericFirstPartyExtractionError("source_scope_violation");
    }
    visitedListings.add(pageUrl);

    const structured = jsonLdNodes(page.html);
    malformedStructuredBlocks += structured.malformed;
    const list = itemListNode(structured.nodes, pageUrl, input.contract);

    if (list) {
      const elements = itemListElements(list);
      const expected = itemListExpectedCount(list);
      if (explicitExpectedItems === null) explicitExpectedItems = expected;
      else if (expected !== null && explicitExpectedItems !== expected) explicitCompleteEnumeration = false;
      if (expected !== null && expected === elements.length) explicitCompleteEnumeration = true;

      for (const element of elements) {
        if (itemUrls.size + records.size >= input.contract.limits.maxItems) {
          truncated = true;
          warnings.add("traversal_limit_reached");
          break;
        }
        const parsed = itemListEntry(element);
        const url = scopeUrl(parsed.urlValue, pageUrl, input.contract);
        if (parsed.urlValue && !url) {
          rejectedUrls += 1;
          continue;
        }
        if (parsed.node && isGenericStructuredItem(parsed.node)) {
          const record = await recordFromNode({
            node: parsed.node,
            pageUrl,
            itemUrl: url,
            source: input.source,
            contract: input.contract,
            discoveryMethod: "JSON_LD_ITEM_LIST",
            detailFetched: false,
            pageTextExcerpt: textFromHtml(page.html).slice(0, 10_000),
          });
          if (record) records.set(recordIdentityKey(record), record);
          else if (url) itemUrls.add(url);
        } else if (url) {
          itemUrls.add(url);
        }
      }
    } else {
      const structuredItems = structured.nodes.filter(isGenericStructuredItem);
      const exact = structuredItems.filter((node) => nodeUrl(node, pageUrl, input.contract) === pageUrl);
      if (visitedListings.size === 1 && exact.length === 1 && structuredItems.length === 1) {
        const record = await recordFromNode({
          node: exact[0],
          pageUrl,
          source: input.source,
          contract: input.contract,
          discoveryMethod: "JSON_LD_DETAIL",
          detailFetched: false,
          pageTextExcerpt: textFromHtml(page.html).slice(0, 10_000),
        });
        if (!record) throw new GenericFirstPartyExtractionError("invalid_item_structure");
        sourceShape = "SINGLE_ITEM";
        const coverage: AutomationExtractionCoverage = {
          classification: "DETAIL_ONLY",
          complete: false,
          enumeratedItemCount: 1,
          visitedPageCount: 1,
          truncated: false,
        };
        return {
          records: [withCoverage(record, coverage)],
          coverage,
          diagnostics: {
            sourceShape,
            visitedListingPages: 1,
            discoveredItemUrls: 1,
            detailFetches: 0,
            rejectedUrls,
            malformedStructuredBlocks,
            warnings: [],
          },
        };
      }

      if (
        visitedListings.size === 1
        && structuredItems.length === 0
        && input.source.config.sourceShape === "SINGLE_ITEM"
        && (
          input.source.entityType === "EVENT"
          || input.source.entityType === "ADOPTION"
          || input.source.entityType === "FOSTER"
          || input.source.entityType === "LOST_FOUND"
        )
      ) {
        const record = input.source.entityType === "ADOPTION"
          ? await adoptionRecordFromHtmlDetail({
              html: page.html,
              pageUrl,
              source: input.source,
              contract: input.contract,
              discoveryMethod: "ADOPTION_ROOT_HTML_DETAIL",
              detailFetched: false,
            })
          : input.source.entityType === "FOSTER"
            ? await fosterRecordFromHtmlDetail({
                html: page.html,
                pageUrl,
                source: input.source,
                contract: input.contract,
                discoveryMethod: "FOSTER_ROOT_HTML_DETAIL",
                detailFetched: false,
              })
            : input.source.entityType === "LOST_FOUND"
              ? await lostFoundRecordFromHtmlDetail({
                  html: page.html,
                  pageUrl,
                  source: input.source,
                  contract: input.contract,
                  discoveryMethod: "LOST_FOUND_ROOT_HTML_DETAIL",
                  detailFetched: false,
                })
              : await (async () => {
              const fallback = htmlDetailEvidence(page.html, pageUrl, input.contract);
              return fallback
                ? recordFromNode({
                    node: fallback.node,
                    pageUrl,
                    itemUrl: fallback.canonical,
                    source: input.source,
                    contract: input.contract,
                    discoveryMethod: "ROOT_HTML_CANONICAL",
                    detailFetched: false,
                    pageTextExcerpt: textFromHtml(page.html).slice(0, 10_000),
                  })
                : null;
            })();
        if (record) {
          sourceShape = "SINGLE_ITEM";
          const coverage: AutomationExtractionCoverage = {
            classification: "DETAIL_ONLY",
            complete: false,
            enumeratedItemCount: 1,
            visitedPageCount: 1,
            truncated: false,
          };
          return {
            records: [withCoverage(record, coverage)],
            coverage,
            diagnostics: {
              sourceShape,
              visitedListingPages: 1,
              discoveredItemUrls: 1,
              detailFetches: 0,
              rejectedUrls,
              malformedStructuredBlocks,
              warnings: [],
            },
          };
        }
      }

      for (const node of structuredItems) {
        if (records.size + itemUrls.size >= input.contract.limits.maxItems) {
          truncated = true;
          warnings.add("traversal_limit_reached");
          break;
        }
        const url = nodeUrl(node, pageUrl, input.contract);
        if (!url) continue;
        const record = await recordFromNode({
          node,
          pageUrl,
          itemUrl: url,
          source: input.source,
          contract: input.contract,
          discoveryMethod: "JSON_LD_COLLECTION",
          detailFetched: false,
          pageTextExcerpt: textFromHtml(page.html).slice(0, 10_000),
        });
        if (record) records.set(recordIdentityKey(record), record);
      }

      const links = qualifiedHtmlLinks(page.html, pageUrl, input.contract);
      rejectedUrls += links.rejected;
      for (const url of links.urls) {
        if (records.size + itemUrls.size >= input.contract.limits.maxItems) {
          truncated = true;
          warnings.add("traversal_limit_reached");
          break;
        }
        itemUrls.add(url);
      }
    }

    const next = explicitNextUrl(page.html, pageUrl, input.contract);
    if (next && !visitedListings.has(next)) {
      if (visitedListings.size >= input.contract.limits.maxPages) {
        truncated = true;
        warnings.add("traversal_limit_reached");
      } else {
        const fetched = await input.fetchPage(next);
        const finalUrl = canonicalizeSourceUrl(fetched.finalUrl);
        if (!finalUrl || !automationUrlWithinApprovedSourceScope(input.contract.identity, finalUrl)) {
          throw new GenericFirstPartyExtractionError("source_scope_violation");
        }
        listingQueue.push({ url: finalUrl, html: fetched.html });
      }
    }
  }

  const existingUrls = new Set(
    [...records.values()].map((record) => record.sourceUrl).filter((value): value is string => Boolean(value)),
  );
  const detailUrls = [...itemUrls].filter((url) => !existingUrls.has(url)).slice(0, input.contract.limits.maxItems);
  if (itemUrls.size > detailUrls.length + existingUrls.size) {
    truncated = true;
    warnings.add("traversal_limit_reached");
  }

  for (const url of detailUrls) {
    if (records.size >= input.contract.limits.maxItems) {
      truncated = true;
      warnings.add("traversal_limit_reached");
      break;
    }
    if (!automationUrlWithinApprovedSourceScope(input.contract.identity, url)) {
      rejectedUrls += 1;
      warnings.add("unsafe_item_url");
      continue;
    }
    detailFetches += 1;
    let fetched: { html: string; finalUrl: string };
    try {
      fetched = await input.fetchPage(url);
    } catch {
      detailFailureCount += 1;
      warnings.add("detail_fetch_failed");
      explicitCompleteEnumeration = false;
      continue;
    }
    const finalUrl = canonicalizeSourceUrl(fetched.finalUrl);
    if (!finalUrl || !automationUrlWithinApprovedSourceScope(input.contract.identity, finalUrl)) {
      throw new GenericFirstPartyExtractionError("source_scope_violation");
    }
    const structured = jsonLdNodes(fetched.html);
    malformedStructuredBlocks += structured.malformed;
    const items = structured.nodes.filter(isGenericStructuredItem);
    const exact = items.filter((node) => nodeUrl(node, finalUrl, input.contract) === finalUrl);
    const node = exact.length === 1 ? exact[0] : items.length === 1 ? items[0] : null;
    let record: AutomationSourceRecord | null = null;
    if (node) {
      record = await recordFromNode({
        node,
        pageUrl: finalUrl,
        itemUrl: finalUrl,
        source: input.source,
        contract: input.contract,
        discoveryMethod: "DETAIL_JSON_LD",
        detailFetched: true,
        pageTextExcerpt: textFromHtml(fetched.html).slice(0, 10_000),
      });
    } else if (input.source.entityType === "ADOPTION") {
      record = await adoptionRecordFromHtmlDetail({
        html: fetched.html,
        pageUrl: finalUrl,
        source: input.source,
        contract: input.contract,
        discoveryMethod: "ADOPTION_DETAIL_HTML",
        detailFetched: true,
      });
    } else if (input.source.entityType === "FOSTER") {
      record = await fosterRecordFromHtmlDetail({
        html: fetched.html,
        pageUrl: finalUrl,
        source: input.source,
        contract: input.contract,
        discoveryMethod: "FOSTER_DETAIL_HTML",
        detailFetched: true,
      });
    } else if (input.source.entityType === "LOST_FOUND") {
      record = await lostFoundRecordFromHtmlDetail({
        html: fetched.html,
        pageUrl: finalUrl,
        source: input.source,
        contract: input.contract,
        discoveryMethod: "LOST_FOUND_DETAIL_HTML",
        detailFetched: true,
      });
    } else {
      const fallback = htmlDetailEvidence(fetched.html, finalUrl, input.contract);
      if (fallback) {
        record = await recordFromNode({
          node: fallback.node,
          pageUrl: finalUrl,
          itemUrl: fallback.canonical,
          source: input.source,
          contract: input.contract,
          discoveryMethod: "DETAIL_HTML_CANONICAL",
          detailFetched: true,
          pageTextExcerpt: textFromHtml(fetched.html).slice(0, 10_000),
        });
      }
    }
    if (!record) {
      detailFailureCount += 1;
      warnings.add(structured.scriptCount > 0 && structured.malformed === structured.scriptCount
        ? "unsupported_structured_data"
        : "invalid_item_structure");
      explicitCompleteEnumeration = false;
      continue;
    }
    records.set(recordIdentityKey(record), record);
  }

  if (!records.size) {
    if (malformedStructuredBlocks > 0) throw new GenericFirstPartyExtractionError("unsupported_structured_data");
    if (detailFetches > 0 && detailFailureCount === detailFetches) {
      throw new GenericFirstPartyExtractionError("detail_fetch_failed");
    }
    throw new GenericFirstPartyExtractionError("no_items_discovered");
  }

  const complete = explicitCompleteEnumeration
    && !truncated
    && detailFailureCount === 0
    && explicitExpectedItems !== null
    && explicitExpectedItems === records.size;
  const coverage: AutomationExtractionCoverage = {
    classification: complete ? "COMPLETE_ENUMERATION" : "BOUNDED_PARTIAL",
    complete,
    enumeratedItemCount: records.size,
    visitedPageCount: visitedListings.size,
    truncated,
  };
  const resultRecords = [...records.values()]
    .slice(0, input.contract.limits.maxItems)
    .map((record) => withCoverage(record, coverage));

  return {
    records: resultRecords,
    coverage,
    diagnostics: {
      sourceShape,
      visitedListingPages: visitedListings.size,
      discoveredItemUrls: new Set([
        ...itemUrls,
        ...resultRecords.map((record) => record.sourceUrl).filter((value): value is string => Boolean(value)),
      ]).size,
      detailFetches,
      rejectedUrls,
      malformedStructuredBlocks,
      warnings: [...warnings],
    },
  };
}

export function genericExtractionEvidenceFingerprint(result: GenericFirstPartyExtractionResult) {
  return stableJson({
    coverage: result.coverage,
    diagnostics: result.diagnostics,
    records: result.records.map((record) => ({
      sourceRecordId: record.sourceRecordId,
      sourceUrl: record.sourceUrl,
      extraction: record.extraction,
    })),
  });
}
