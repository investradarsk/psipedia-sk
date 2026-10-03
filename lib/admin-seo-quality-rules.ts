import type { EditableSeo } from "@/lib/content-seo";

export const adminSeoAgendas = [
  "directory",
  "events",
  "help",
  "organizations",
  "adoptions",
  "breeds",
  "articles",
] as const;

export type AdminSeoAgenda = (typeof adminSeoAgendas)[number];
export type AdminSeoFindingScope = "custom" | "content" | "metadata" | "indexing" | "discovery";
export type AdminSeoFindingSeverity = "info" | "warning" | "error";

export const adminSeoAgendaLabels: Record<AdminSeoAgenda, string> = {
  directory: "Adresár",
  events: "Podujatia",
  help: "Pomoc psom",
  organizations: "Organizácie",
  adoptions: "Adopcie",
  breeds: "Plemená",
  articles: "Články",
};

export const adminSeoIssueDefinitions = [
  { code: "description-missing", label: "Chýba Popis" },
  { code: "description-weak", label: "Príliš slabý Popis" },
  { code: "excerpt-description-identical", label: "Identický Perex a Popis" },
  { code: "unique-content-short", label: "Veľmi krátky unikátny obsah" },
  { code: "image-missing", label: "Chýba obrázok" },
  { code: "image-alt-missing", label: "Obrázok bez výsledného alt textu" },
  { code: "custom-title-missing", label: "Custom SEO title chýba" },
  { code: "custom-description-missing", label: "Custom SEO description chýba" },
  { code: "result-title-weak", label: "Výsledný SEO title je slabý" },
  { code: "result-description-weak", label: "Výsledný SEO description je slabý" },
  { code: "noindex-explicit", label: "Explicitný Noindex" },
  { code: "canonical-nonstandard", label: "Neštandardný canonical" },
  { code: "slug-missing", label: "Chýba slug" },
  { code: "city-missing", label: "Chýba mesto" },
  { code: "category-missing", label: "Chýba kategória / typ" },
  { code: "crawlable-parent-missing", label: "Chýba známy crawlable parent/listing" },
] as const;

export type AdminSeoIssueCode = (typeof adminSeoIssueDefinitions)[number]["code"];

export type AdminSeoQualityEntity = {
  agenda: AdminSeoAgenda;
  id: number;
  title: string;
  slug: string;
  adminHref: string;
  expectedCanonicalPath: string;
  parentPath: string | null;
  excerpt: string;
  description: string;
  uniqueContentParts: string[];
  imageUrl: string;
  imageAlt: string;
  imageIsDecorative?: boolean;
  city?: string;
  cityRequired?: boolean;
  category?: string;
  categoryRequired?: boolean;
  customSeoSupported: boolean;
  customSeoTitle: string | null;
  customSeoDescription: string | null;
  customCanonical: string;
  noindex: boolean;
  resultTitle: string;
  resultDescription: string;
};

export type AdminSeoQualityFinding = {
  code: AdminSeoIssueCode;
  label: string;
  scope: AdminSeoFindingScope;
  severity: AdminSeoFindingSeverity;
  detail: string;
};

export type AdminSeoQualityItem = {
  entity: AdminSeoQualityEntity;
  findings: AdminSeoQualityFinding[];
  qualityFindingCount: number;
  customGapCount: number;
};

export type AdminSeoQualityFilters = {
  agenda?: AdminSeoAgenda | "all";
  scope?: "all" | "quality" | "custom";
  issue?: AdminSeoIssueCode | "all";
  query?: string;
  page?: number;
};

export type AdminSeoQualityReport = {
  generatedAt: string;
  entityCount: number;
  itemsWithAnyFinding: number;
  entitiesWithQualityFindings: number;
  entitiesWithCustomGaps: number;
  explicitNoindex: number;
  resultCount: number;
  items: AdminSeoQualityItem[];
  agendaCounts: Record<AdminSeoAgenda, {
    entities: number;
    qualityEntities: number;
    customGapEntities: number;
    findings: number;
  }>;
  filters: Required<Pick<AdminSeoQualityFilters, "agenda" | "scope" | "issue">> & { query: string };
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

export const ADMIN_SEO_QUALITY_THRESHOLDS = {
  descriptionMin: 80,
  uniqueContentMin: 180,
  resultTitleMin: 18,
  resultTitleMax: 70,
  resultDescriptionMin: 70,
  resultDescriptionMax: 180,
} as const;

const issueLabel = new Map(adminSeoIssueDefinitions.map((item) => [item.code, item.label]));

export function seoAuditText(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

export function normalizeSeoComparable(value: string) {
  return value
    .normalize("NFKC")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("sk");
}

export function seoUniqueContentLength(parts: string[]) {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const part of parts) {
    const normalized = normalizeSeoComparable(part);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    kept.push(part.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
  }
  return kept.join(" ").length;
}

export function seoStringsFromJson(value: unknown): string[] {
  const raw = seoAuditText(value);
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [raw];
  }
  const output: string[] = [];
  const visit = (item: unknown) => {
    if (typeof item === "string") {
      if (item.trim()) output.push(item.trim());
      return;
    }
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (item && typeof item === "object") {
      Object.values(item as Record<string, unknown>).forEach(visit);
    }
  };
  visit(parsed);
  return output;
}

export function parseSeoAuditJson(value: unknown): EditableSeo {
  const raw = seoAuditText(value);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      title: seoAuditText(parsed.title),
      description: seoAuditText(parsed.description),
      canonicalUrl: seoAuditText(parsed.canonicalUrl),
      noindex: Boolean(parsed.noindex),
      focusKeyword: seoAuditText(parsed.focusKeyword),
      ogTitle: seoAuditText(parsed.ogTitle),
      ogDescription: seoAuditText(parsed.ogDescription),
      ogImage: seoAuditText(parsed.ogImage),
    };
  } catch {
    return {};
  }
}

function canonicalPath(value: string) {
  if (!value) return "";
  try {
    const url = new URL(value, "https://psipedia.sk");
    if (url.protocol !== "https:" || url.hostname !== "psipedia.sk") return "__invalid__";
    return url.pathname.replace(/\/+$/, "") || "/";
  } catch {
    return "__invalid__";
  }
}

function finding(
  code: AdminSeoIssueCode,
  scope: AdminSeoFindingScope,
  severity: AdminSeoFindingSeverity,
  detail: string,
): AdminSeoQualityFinding {
  return { code, label: issueLabel.get(code) ?? code, scope, severity, detail };
}

export function auditSeoQualityEntity(entity: AdminSeoQualityEntity): AdminSeoQualityFinding[] {
  const t = ADMIN_SEO_QUALITY_THRESHOLDS;
  const findings: AdminSeoQualityFinding[] = [];
  const description = seoAuditText(entity.description);
  const excerpt = seoAuditText(entity.excerpt);
  const slug = seoAuditText(entity.slug);
  const customTitle = entity.customSeoTitle === null ? null : seoAuditText(entity.customSeoTitle);
  const customDescription = entity.customSeoDescription === null ? null : seoAuditText(entity.customSeoDescription);

  if (!description) {
    findings.push(finding("description-missing", "content", "warning", "Publikovaná entita nemá hlavný Popis."));
  } else if (description.length < t.descriptionMin) {
    findings.push(finding("description-weak", "content", "warning", `Popis má iba ${description.length} znakov; interná heuristika používa minimum ${t.descriptionMin}.`));
  }
  if (excerpt && description && normalizeSeoComparable(excerpt) === normalizeSeoComparable(description)) {
    findings.push(finding("excerpt-description-identical", "content", "warning", "Perex a Popis sú po normalizácii identické."));
  }

  const uniqueLength = seoUniqueContentLength(entity.uniqueContentParts);
  if (uniqueLength < t.uniqueContentMin) {
    findings.push(finding("unique-content-short", "content", "warning", `Unikátny textový obsah má približne ${uniqueLength} znakov; interná heuristika používa minimum ${t.uniqueContentMin}.`));
  }

  if (!seoAuditText(entity.imageUrl)) {
    findings.push(finding("image-missing", "content", "warning", "Publikovaná entita nemá hlavný obrázok."));
  } else if (!entity.imageIsDecorative && !seoAuditText(entity.imageAlt)) {
    findings.push(finding("image-alt-missing", "content", "warning", 'Hlavný obsahový obrázok nemá výsledný alt text. Dekoratívne alt="" sa sem nezapočítava.'));
  }

  if (entity.customSeoSupported && customTitle !== null && !customTitle) {
    findings.push(finding("custom-title-missing", "custom", "info", "Custom SEO title nie je vyplnený; kvalitný fallback môže byť úplne postačujúci."));
  }
  if (entity.customSeoSupported && customDescription !== null && !customDescription) {
    findings.push(finding("custom-description-missing", "custom", "info", "Custom SEO description nie je vyplnený; kvalitný fallback môže byť úplne postačujúci."));
  }

  const resultTitleLength = seoAuditText(entity.resultTitle).length;
  if (resultTitleLength < t.resultTitleMin || resultTitleLength > t.resultTitleMax) {
    findings.push(finding("result-title-weak", "metadata", "warning", `Výsledný title má ${resultTitleLength} znakov; interná heuristika je ${t.resultTitleMin}–${t.resultTitleMax}.`));
  }
  const resultDescriptionLength = seoAuditText(entity.resultDescription).length;
  if (resultDescriptionLength < t.resultDescriptionMin || resultDescriptionLength > t.resultDescriptionMax) {
    findings.push(finding("result-description-weak", "metadata", "warning", `Výsledný description má ${resultDescriptionLength} znakov; interná heuristika je ${t.resultDescriptionMin}–${t.resultDescriptionMax}.`));
  }

  if (entity.noindex) {
    findings.push(finding("noindex-explicit", "indexing", "error", "Publikovaná canonical entita má explicitný noindex. Audit ho nemení."));
  }

  const customCanonical = seoAuditText(entity.customCanonical);
  if (customCanonical) {
    const actual = canonicalPath(customCanonical);
    const expected = canonicalPath(entity.expectedCanonicalPath);
    if (actual === "__invalid__" || actual !== expected) {
      findings.push(finding("canonical-nonstandard", "indexing", "error", `Explicitný canonical smeruje na „${customCanonical}“, očakávaná cesta je „${entity.expectedCanonicalPath}“.`));
    }
  }

  if (!slug) findings.push(finding("slug-missing", "indexing", "error", "Publikovaná canonical entita nemá slug."));
  if (entity.cityRequired && !seoAuditText(entity.city)) {
    findings.push(finding("city-missing", "content", "warning", "Pre túto agendu sa pri publikovanej entite očakáva mesto."));
  }
  if (entity.categoryRequired && !seoAuditText(entity.category)) {
    findings.push(finding("category-missing", "content", "warning", "Pre túto agendu sa pri publikovanej entite očakáva kategória alebo typ."));
  }
  if (!entity.parentPath) {
    findings.push(finding("crawlable-parent-missing", "discovery", "warning", "Audit nevie priradiť známu crawlable parent/listing cestu tejto agendy."));
  }

  return findings;
}
