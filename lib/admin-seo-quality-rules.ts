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
export type AdminSeoImageAltMode = "stored" | "derived-public" | "decorative" | "unsupported";

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
  { code: "description-missing", label: "Chýba popis" },
  { code: "description-weak", label: "Príliš krátky popis" },
  { code: "excerpt-description-identical", label: "Zhodný perex a popis" },
  { code: "unique-content-short", label: "Veľmi krátky unikátny obsah" },
  { code: "image-missing", label: "Chýba obrázok" },
  { code: "image-alt-missing", label: "Obrázok bez výsledného alt textu" },
  { code: "custom-title-missing", label: "Chýba vlastný SEO titulok" },
  { code: "custom-description-missing", label: "Chýba vlastný meta popis" },
  { code: "result-title-weak", label: "Nevhodná dĺžka výsledného SEO titulku" },
  { code: "result-description-weak", label: "Nevhodná dĺžka výsledného meta popisu" },
  { code: "noindex-explicit", label: "Výslovný zákaz indexovania (noindex)" },
  { code: "canonical-nonstandard", label: "Neštandardná kanonická adresa" },
  { code: "slug-missing", label: "Chýba identifikátor URL" },
  { code: "city-missing", label: "Chýba mesto" },
  { code: "category-missing", label: "Chýba kategória / typ" },
  { code: "crawlable-parent-missing", label: "Chýba známa nadradená stránka" },
] as const;

export type AdminSeoIssueCode = (typeof adminSeoIssueDefinitions)[number]["code"];

/** Metadata checks remain meaningful for generated metadata on profiles without editable custom SEO. */
const seoMetadataCodes: ReadonlySet<AdminSeoIssueCode> = new Set([
  "custom-title-missing", "custom-description-missing",
  "result-title-weak", "result-description-weak",
  "image-missing", "image-alt-missing",
  "noindex-explicit", "canonical-nonstandard", "slug-missing",
]);
export function isSeoMetadataIssue(code: AdminSeoIssueCode) {
  return seoMetadataCodes.has(code);
}
export function isSeoMetadataFinding(finding: AdminSeoQualityFinding) {
  return isSeoMetadataIssue(finding.code);
}
export function isSeoProfileAgenda(agenda: AdminSeoAgenda) {
  return agenda !== "articles" && agenda !== "events";
}


export type AdminSeoEntityType = AdminSeoAgenda | "lostFound";

export function seoEntityKey(entity: Pick<AdminSeoQualityEntity, "entityType" | "id">) {
  return `${entity.entityType}:${entity.id}`;
}

export type AdminSeoQualityEntity = {
  entityType: AdminSeoEntityType;
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
  imageAltMode: AdminSeoImageAltMode;
  imageAltSource: string;
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
  agenda?: AdminSeoAgenda | "all" | "profiles";
  scope?: "all" | "quality" | "custom" | "metadata";
  issue?: AdminSeoIssueCode | "all";
  query?: string;
  page?: number;
};

export type AdminSeoAuditAvailability = "complete" | "partial" | "error";
export type AdminSeoAgendaAvailability = AdminSeoAuditAvailability | "not-requested";

export type AdminSeoAgendaCounts = {
  entities: number;
  qualityEntities: number;
  customGapEntities: number;
  findings: number;
};

export type AdminSeoQualityReport = {
  availability: AdminSeoAuditAvailability;
  agendaAvailability: Record<AdminSeoAgenda, AdminSeoAgendaAvailability>;
  failedSources: string[];
  generatedAt: string;
  entityCount: number | null;
  filteredEntityCount: number | null;
  filteredCustomGapEntities: number | null;
  filteredIssueCounts: Record<AdminSeoIssueCode, number> | null;
  itemsWithAnyFinding: number | null;
  entitiesWithQualityFindings: number | null;
  entitiesWithCustomGaps: number | null;
  explicitNoindex: number | null;
  resultCount: number | null;
  resultFindingCount: number | null;
  resultProfileCount: number | null;
  items: AdminSeoQualityItem[];
  agendaCounts: Record<AdminSeoAgenda, AdminSeoAgendaCounts | null>;
  issueCounts: Record<AdminSeoIssueCode, number> | null;
  filters: Required<Pick<AdminSeoQualityFilters, "agenda" | "scope" | "issue">> & { query: string };
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

export const ADMIN_SEO_QUALITY_THRESHOLDS = {
  descriptionMin: 80,
  uniqueContentMin: 180,
  resultTitleMin: 25,
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
      noindex: parsed.noindex === true || parsed.noindex === 1 || parsed.noindex === "1",
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
  } else if (
    entity.imageAltMode !== "decorative"
    && entity.imageAltMode !== "unsupported"
    && !seoAuditText(entity.imageAlt)
  ) {
    findings.push(finding(
      "image-alt-missing",
      "content",
      "warning",
      `Hlavný obsahový obrázok nemá reálny ALT zo zdroja „${entity.imageAltSource}“. Dekoratívne alt="" sa sem nezapočítava.`,
    ));
  }

  if (entity.customSeoSupported && customTitle !== null && !customTitle) {
    findings.push(finding("custom-title-missing", "custom", "info", "Vlastný SEO titulok nie je vyplnený; automaticky vytvorený titulok môže postačovať."));
  }
  if (entity.customSeoSupported && customDescription !== null && !customDescription) {
    findings.push(finding("custom-description-missing", "custom", "info", "Vlastný meta popis nie je vyplnený; automaticky vytvorený popis môže postačovať."));
  }

  const unbrandedResultTitle = seoAuditText(entity.resultTitle).replace(/\s*(?:\||–|—|-)\s*Psipedia(?:\.sk)?\s*$/iu, "").trim();
  const finalDocumentTitle = unbrandedResultTitle ? `${unbrandedResultTitle} | Psipedia.sk` : "";
  const resultTitleLength = finalDocumentTitle.length;
  if (resultTitleLength < t.resultTitleMin || resultTitleLength > t.resultTitleMax) {
    findings.push(finding("result-title-weak", "metadata", "warning", `Výsledný dokumentový <title> má ${resultTitleLength} znakov vrátane názvu webu; odporúčaná dĺžka je ${t.resultTitleMin}–${t.resultTitleMax}.`));
  }
  const resultDescriptionLength = seoAuditText(entity.resultDescription).length;
  if (resultDescriptionLength < t.resultDescriptionMin || resultDescriptionLength > t.resultDescriptionMax) {
    findings.push(finding("result-description-weak", "metadata", "warning", `Výsledný meta popis má ${resultDescriptionLength} znakov; interná heuristika je ${t.resultDescriptionMin}–${t.resultDescriptionMax}.`));
  }

  if (entity.noindex) {
    findings.push(finding("noindex-explicit", "indexing", "error", "Publikovaný záznam má výslovný zákaz indexovania (noindex). Audit ho nemení."));
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
    findings.push(finding("crawlable-parent-missing", "discovery", "warning", "Audit nevie priradiť známu nadradenú stránku alebo verejný zoznam."));
  }

  return findings;
}
