export const ADMIN_LIST_DEFAULT_PAGE_SIZE = 50;
export const ADMIN_LIST_MAX_PAGE_SIZE = 100;

export const adminListAvailabilityStates = ["OK", "EMPTY", "PARTIAL", "UNAVAILABLE"] as const;
export type AdminListAvailability = (typeof adminListAvailabilityStates)[number];

export function boundedAdminPage(value: unknown) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function boundedAdminPageSize(value: unknown, fallback = ADMIN_LIST_DEFAULT_PAGE_SIZE) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return fallback;
  return Math.min(ADMIN_LIST_MAX_PAGE_SIZE, parsed);
}

export function normalizeAdminSearch(value: unknown, maxLength = 120) {
  return String(value ?? "")
    .trim()
    .slice(0, maxLength)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("sk")
    .replace(/\s+/g, " ");
}

export function escapeAdminLike(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export function adminContainsNeedle(value: unknown, maxLength = 120) {
  const normalized = normalizeAdminSearch(value, maxLength);
  return normalized ? `%${escapeAdminLike(normalized)}%` : "";
}

export function sqlFoldAdminText(expression: string) {
  const replacements: Array<[string, string]> = [
    ["á", "a"], ["ä", "a"], ["č", "c"], ["ď", "d"], ["é", "e"], ["í", "i"],
    ["ĺ", "l"], ["ľ", "l"], ["ň", "n"], ["ó", "o"], ["ô", "o"], ["ŕ", "r"],
    ["š", "s"], ["ť", "t"], ["ú", "u"], ["ý", "y"], ["ž", "z"],
    ["Á", "a"], ["Ä", "a"], ["Č", "c"], ["Ď", "d"], ["É", "e"], ["Í", "i"],
    ["Ĺ", "l"], ["Ľ", "l"], ["Ň", "n"], ["Ó", "o"], ["Ô", "o"], ["Ŕ", "r"],
    ["Š", "s"], ["Ť", "t"], ["Ú", "u"], ["Ý", "y"], ["Ž", "z"],
  ];
  return replacements.reduce(
    (current, [from, to]) => `replace(${current}, '${from}', '${to}')`,
    `lower(${expression})`,
  );
}

/**
 * Shared GET-list URL assembly. Callers own the order and omission rules of
 * domain-specific filters; this helper only encodes nonempty values and page.
 */
export function adminFilteredListHref(
  path: string,
  fields: ReadonlyArray<readonly [string, string | null | undefined]>,
  page = 1,
) {
  const params = new URLSearchParams();
  for (const [key, value] of fields) {
    if (value) params.set(key, value);
  }
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return path + (query ? `?${query}` : "");
}
