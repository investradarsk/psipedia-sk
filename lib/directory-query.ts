import type { DirectoryFilters } from "@/lib/directory-store";

/** One canonical directory GET serializer for search, filters and pagination. */
export function directoryQueryFields(
  filters: DirectoryFilters,
  omit: readonly string[] = [],
): Array<{ name: string; value: string }> {
  const fields: Array<{ name: string; value: string }> = [];
  const values: Array<[string, string]> = [
    ["q", filters.query],
    ["category", filters.category],
    ["region", filters.region],
    ["district", filters.district],
    ["city", filters.city],
    ["service", filters.service],
    ["breed", filters.breed],
    ["fci", filters.fciGroup],
    ["organization", filters.organization],
    ["type", filters.profileType],
    ["sort", filters.sort === "recommended" ? "" : filters.sort],
    ["page", filters.page > 1 ? String(filters.page) : ""],
  ];
  for (const [name, value] of values) {
    if (!omit.includes(name) && value.trim()) fields.push({ name, value });
  }
  return fields;
}

export function directoryPageHref(basePath: string, filters: DirectoryFilters, page: number) {
  const params = new URLSearchParams();
  for (const field of directoryQueryFields(filters, ["page"])) params.set(field.name, field.value);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? basePath + "?" + query : basePath;
}
