import { env } from "cloudflare:workers";
import { loadSeoQualitySources } from "@/lib/admin-seo-quality-entities";
import { selectAdminSeoQualityPage } from "@/lib/admin-seo-quality-page";
import {
  adminSeoAgendas,
  adminSeoIssueDefinitions,
  auditSeoQualityEntity,
  normalizeSeoComparable,
  seoAuditText,
  type AdminSeoAgendaCounts,
  type AdminSeoAgendaAvailability,
  type AdminSeoAuditAvailability,
  type AdminSeoQualityFilters,
  type AdminSeoQualityItem,
  type AdminSeoQualityReport,
} from "@/lib/admin-seo-quality-rules";

const PAGE_SIZE = 50;

function normalizeFilters(input: AdminSeoQualityFilters) {
  const agenda = input.agenda && (input.agenda === "all" || input.agenda === "profiles" || (adminSeoAgendas as readonly string[]).includes(input.agenda))
    ? input.agenda
    : "profiles";
  const scope = input.scope === "quality" || input.scope === "custom" || input.scope === "all" ? input.scope : "metadata";
  const issue = input.issue && (input.issue === "all" || adminSeoIssueDefinitions.some((item) => item.code === input.issue))
    ? input.issue
    : "all";
  const query = seoAuditText(input.query).slice(0, 120);
  const page = Number.isSafeInteger(input.page) && Number(input.page) > 0 ? Number(input.page) : 1;
  return { agenda, scope, issue, query, page } as const;
}

function emptyCounts(): AdminSeoAgendaCounts {
  return { entities: 0, qualityEntities: 0, customGapEntities: 0, findings: 0 };
}

function emptyIssueCounts(): NonNullable<AdminSeoQualityReport["issueCounts"]> {
  return Object.fromEntries(adminSeoIssueDefinitions.map((issue) => [issue.code, 0])) as NonNullable<AdminSeoQualityReport["issueCounts"]>;
}

export async function buildAdminSeoQualityAudit(
  database: D1Database | undefined,
  input: AdminSeoQualityFilters = {},
): Promise<AdminSeoQualityReport> {
  const filters = normalizeFilters(input);
  const sources = await loadSeoQualitySources(database, filters.agenda);
  const failedSources = sources.filter((source) => source.status === "error").map((source) => source.source);
  const available = sources.some((source) => source.status === "available");
  const availability: AdminSeoAuditAvailability = !available
    ? "error"
    : failedSources.length ? "partial" : "complete";

  const agendaCounts = Object.fromEntries(adminSeoAgendas.map((agenda) => [agenda, null])) as AdminSeoQualityReport["agendaCounts"];
  const agendaAvailability = Object.fromEntries(adminSeoAgendas.map((agenda) => {
    const group = sources.filter((source) => source.agenda === agenda);
    const status: AdminSeoAgendaAvailability = !group.length
      ? "not-requested"
      : group.every((source) => source.status === "error")
        ? "error"
        : group.some((source) => source.status === "error") ? "partial" : "complete";
    return [agenda, status];
  })) as AdminSeoQualityReport["agendaAvailability"];

  const issueCounts = emptyIssueCounts();
  const totals = emptyCounts();
  const inbox: AdminSeoQualityItem[] = [];
  const filtered: AdminSeoQualityItem[] = [];
  const needle = normalizeSeoComparable(filters.query);
  let explicitNoindex = 0;

  // Exactly one audit per entity in the requested scope. No global detail scan,
  // no cross-request cache, and no materialization of an extra audited list.
  for (const source of sources) {
    if (source.status === "error") continue;
    const counts = agendaCounts[source.agenda] ?? emptyCounts();
    agendaCounts[source.agenda] = counts;
    for (const entity of source.entities) {
      const findings = auditSeoQualityEntity(entity);
      const customGapCount = findings.filter((finding) => finding.scope === "custom").length;
      const qualityFindingCount = findings.length - customGapCount;
      counts.entities += 1;
      counts.findings += findings.length;
      if (qualityFindingCount > 0) counts.qualityEntities += 1;
      if (customGapCount > 0) counts.customGapEntities += 1;
      for (const finding of findings) issueCounts[finding.code] += 1;
      if (findings.some((finding) => finding.code === "noindex-explicit")) explicitNoindex += 1;
      if (findings.length === 0) continue;
      const item = { entity, findings, customGapCount, qualityFindingCount };
      inbox.push(item);
      if (needle && !normalizeSeoComparable([
        entity.title, entity.slug, entity.city ?? "", entity.category ?? "",
      ].join(" ")).includes(needle)) continue;
      filtered.push(item);
    }
  }

  for (const counts of Object.values(agendaCounts)) {
    if (!counts) continue;
    totals.entities += counts.entities;
    totals.findings += counts.findings;
    totals.qualityEntities += counts.qualityEntities;
    totals.customGapEntities += counts.customGapEntities;
  }

  // The shared page selector applies finding scope and issue exactly once.
  const selected = selectAdminSeoQualityPage(filtered, filters, filters.page, PAGE_SIZE);

  return {
    generatedAt: new Date().toISOString(),
    availability,
    agendaAvailability,
    failedSources,
    entityCount: available ? totals.entities : null,
    filteredEntityCount: available ? totals.entities : null,
    filteredCustomGapEntities: available ? totals.customGapEntities : null,
    filteredIssueCounts: available ? issueCounts : null,
    itemsWithAnyFinding: available ? inbox.length : null,
    entitiesWithQualityFindings: available ? totals.qualityEntities : null,
    entitiesWithCustomGaps: available ? totals.customGapEntities : null,
    explicitNoindex: available ? explicitNoindex : null,
    resultCount: available ? selected.total : null,
    items: selected.items,
    agendaCounts,
    issueCounts: available ? issueCounts : null,
    filters: {
      agenda: filters.agenda,
      scope: filters.scope,
      issue: filters.issue,
      query: filters.query,
    },
    pagination: {
      page: selected.page,
      pageSize: PAGE_SIZE,
      total: selected.total,
      totalPages: selected.totalPages,
    },
  };
}

export async function loadAdminSeoQualityAudit(
  input: AdminSeoQualityFilters = {},
): Promise<AdminSeoQualityReport> {
  const database = (env as unknown as { DB?: D1Database }).DB;
  return buildAdminSeoQualityAudit(database, input);
}
