import { organizationPublicationStatuses, organizationPublicationTypes, type OrganizationPublicationStatus } from "./help-organization-publication.ts";

export const ORGANIZATION_ADMIN_PAGE_SIZE = 50;

export type OrganizationAdminFilters = {
  q: string;
  type: string;
  status: "all" | OrganizationPublicationStatus;
  region: string;
  district: string;
  city: string;
  missingLocation: boolean;
  incomplete: boolean;
  page: number;
};

function value(params: { get(name: string): string | null }, key: string, max: number) {
  return (params.get(key) ?? "").trim().slice(0, max);
}

export function parseOrganizationAdminFilters(params: { get(name: string): string | null }): OrganizationAdminFilters {
  const rawType = value(params, "type", 80);
  const rawStatus = value(params, "status", 40);
  const rawPage = value(params, "page", 12) || "1";
  return {
    q: value(params, "q", 120),
    type: organizationPublicationTypes.includes(rawType as (typeof organizationPublicationTypes)[number]) ? rawType : "",
    status: organizationPublicationStatuses.includes(rawStatus as OrganizationPublicationStatus)
      ? rawStatus as OrganizationPublicationStatus
      : "all",
    region: value(params, "region", 100),
    district: value(params, "district", 100),
    city: value(params, "city", 120),
    missingLocation: value(params, "missingLocation", 10) === "1",
    incomplete: value(params, "incomplete", 10) === "1",
    page: /^\d{1,9}$/.test(rawPage) ? Math.max(1, Number(rawPage)) : 1,
  };
}

export function organizationAdminHref(filters: OrganizationAdminFilters) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.type) params.set("type", filters.type);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.region) params.set("region", filters.region);
  if (filters.district) params.set("district", filters.district);
  if (filters.city) params.set("city", filters.city);
  if (filters.missingLocation) params.set("missingLocation", "1");
  if (filters.incomplete) params.set("incomplete", "1");
  if (filters.page > 1) params.set("page", String(filters.page));
  const query = params.toString();
  return `/admin/organizacie${query ? `?${query}` : ""}`;
}

export function normalizeOrganizationAdminSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("sk")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function sqlOrganizationAdminNormalizedExpression(expression: string) {
  const replacements: Array<[string, string]> = [
    ["á", "a"], ["ä", "a"], ["č", "c"], ["ď", "d"], ["é", "e"], ["í", "i"],
    ["ĺ", "l"], ["ľ", "l"], ["ň", "n"], ["ó", "o"], ["ô", "o"], ["ŕ", "r"],
    ["š", "s"], ["ť", "t"], ["ú", "u"], ["ý", "y"], ["ž", "z"],
    ["Á", "a"], ["Ä", "a"], ["Č", "c"], ["Ď", "d"], ["É", "e"], ["Í", "i"],
    ["Ĺ", "l"], ["Ľ", "l"], ["Ň", "n"], ["Ó", "o"], ["Ô", "o"], ["Ŕ", "r"],
    ["Š", "s"], ["Ť", "t"], ["Ú", "u"], ["Ý", "y"], ["Ž", "z"],
  ];
  let normalized = replacements.reduce((current, [from, to]) => `replace(${current}, '${from}', '${to}')`, `lower(${expression})`);
  for (const punctuation of ["-", "/", "&", ".", ",", "(", ")", "[", "]", "'", "@", "+"]) {
    const escaped = punctuation.replaceAll("'", "''");
    normalized = `replace(${normalized}, '${escaped}', ' ')`;
  }
  return normalized;
}
