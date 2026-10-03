import { env } from "cloudflare:workers";
import { loadPublishedSeoQualityEntities } from "@/lib/admin-seo-quality-entities";
import {
  adminSeoAgendas,
  adminSeoIssueDefinitions,
  auditSeoQualityEntity,
  normalizeSeoComparable,
  seoAuditText,
  type AdminSeoQualityFilters,
  type AdminSeoQualityItem,
  type AdminSeoQualityReport,
} from "@/lib/admin-seo-quality-rules";

const PAGE_SIZE = 50;

function normalizeFilters(input: AdminSeoQualityFilters) {
  const agenda = input.agenda && (input.agenda === "all" || (adminSeoAgendas as readonly string[]).includes(input.agenda))
    ? input.agenda
    : "all";
  const scope = input.scope === "quality" || input.scope === "custom" ? input.scope : "all";
  const issue = input.issue && (input.issue === "all" || adminSeoIssueDefinitions.some((item) => item.code === input.issue))
    ? input.issue
    : "all";
  const query = seoAuditText(input.query).slice(0, 120);
  const page = Number.isSafeInteger(input.page) && Number(input.page) > 0 ? Number(input.page) : 1;
  return { agenda, scope, issue, query, page } as const;
}

function emptyAgendaCounts(): AdminSeoQualityReport["agendaCounts"] {
  return Object.fromEntries(adminSeoAgendas.map((agenda) => [agenda, {
    entities: 0,
    qualityEntities: 0,
    customGapEntities: 0,
    findings: 0,
  }])) as AdminSeoQualityReport["agendaCounts"];
}

function emptyIssueCounts(): AdminSeoQualityReport["issueCounts"] {
  return Object.fromEntries(adminSeoIssueDefinitions.map((issue) => [issue.code, 0])) as AdminSeoQualityReport["issueCounts"];
}

export async function loadAdminSeoQualityAudit(input: AdminSeoQualityFilters = {}): Promise<AdminSeoQualityReport> {
  const database = (env as unknown as { DB?: D1Database }).DB;
  if (!database) throw new Error("SEO quality audit vyžaduje pripojenú D1 databázu.");

  const filters = normalizeFilters(input);
  const entities = await loadPublishedSeoQualityEntities(database);
  const audited = entities.map((entity): AdminSeoQualityItem => {
    const findings = auditSeoQualityEntity(entity);
    const customGapCount = findings.filter((finding) => finding.scope === "custom").length;
    return {
      entity,
      findings,
      customGapCount,
      qualityFindingCount: findings.length - customGapCount,
    };
  });

  const agendaCounts = emptyAgendaCounts();
  const issueCounts = emptyIssueCounts();
  for (const item of audited) {
    const counts = agendaCounts[item.entity.agenda];
    counts.entities += 1;
    counts.findings += item.findings.length;
    if (item.qualityFindingCount > 0) counts.qualityEntities += 1;
    if (item.customGapCount > 0) counts.customGapEntities += 1;
    for (const finding of item.findings) issueCounts[finding.code] += 1;
  }

  const inbox = audited.filter((item) => item.findings.length > 0);
  const needle = normalizeSeoComparable(filters.query);
  const filtered = inbox.filter((item) => {
    if (filters.agenda !== "all" && item.entity.agenda !== filters.agenda) return false;
    if (filters.scope === "quality" && item.qualityFindingCount === 0) return false;
    if (filters.scope === "custom" && item.customGapCount === 0) return false;
    if (filters.issue !== "all" && !item.findings.some((finding) => finding.code === filters.issue)) return false;
    if (needle) {
      const haystack = normalizeSeoComparable([
        item.entity.title,
        item.entity.slug,
        item.entity.city ?? "",
        item.entity.category ?? "",
      ].join(" "));
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });

  const visible = filtered.map((item) => ({
    ...item,
    findings: item.findings.filter((finding) => {
      if (filters.scope === "quality" && finding.scope === "custom") return false;
      if (filters.scope === "custom" && finding.scope !== "custom") return false;
      if (filters.issue !== "all" && finding.code !== filters.issue) return false;
      return true;
    }),
  })).filter((item) => item.findings.length > 0);

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const page = Math.min(filters.page, totalPages);
  const offset = (page - 1) * PAGE_SIZE;

  return {
    generatedAt: new Date().toISOString(),
    entityCount: entities.length,
    itemsWithAnyFinding: inbox.length,
    entitiesWithQualityFindings: audited.filter((item) => item.qualityFindingCount > 0).length,
    entitiesWithCustomGaps: audited.filter((item) => item.customGapCount > 0).length,
    explicitNoindex: audited.filter((item) => item.findings.some((finding) => finding.code === "noindex-explicit")).length,
    resultCount: visible.length,
    items: visible.slice(offset, offset + PAGE_SIZE),
    agendaCounts,
    issueCounts,
    filters: {
      agenda: filters.agenda,
      scope: filters.scope,
      issue: filters.issue,
      query: filters.query,
    },
    pagination: {
      page,
      pageSize: PAGE_SIZE,
      total: visible.length,
      totalPages,
    },
  };
}
