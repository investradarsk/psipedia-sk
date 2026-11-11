/**
 * Psipedia user-facing scoped IDs, e.g. 25/2.
 *
 * The D1 INTEGER primary keys and Notion "Psipedia ID" values NEVER change.
 * Every canonical category gets one permanently reserved numeric suffix.
 * No overlap between tables (including legacy categories and unknown kinds).
 */
export type DisplayIdKind =
  | "breeds" | "directory" | "events" | "articles" | "adoptions"
  | "lost-found" | "organizations" | "help" | "eshops";

export type DisplayIdScope = {
  readonly code: number;
  readonly kind: DisplayIdKind;
  readonly category: string | null;
  readonly label: string;
};

/** Append-only registry. Never renumber or reuse a removed suffix. */
export const displayIdScopes: readonly DisplayIdScope[] = [
  { code: 1, kind: "breeds", category: null, label: "Plemená" },
  { code: 2, kind: "directory", category: "veterinari", label: "Veterinári" },
  { code: 3, kind: "directory", category: "treneri", label: "Psí tréneri a školy" },
  { code: 4, kind: "directory", category: "kynologicke-kluby", label: "Kynologické kluby" },
  { code: 5, kind: "directory", category: "chovatelske-kluby", label: "Chovateľské kluby" },
  { code: 6, kind: "directory", category: "chovatelske-stanice", label: "Chovateľské stanice" },
  { code: 7, kind: "directory", category: "salony-a-sluzby", label: "Psie salóny" },
  { code: 8, kind: "directory", category: "hotely-a-opatrovanie", label: "Hotely a opatrovanie" },
  { code: 9, kind: "directory", category: "vencenie", label: "Venčenie" },
  { code: 10, kind: "directory", category: "fyzioterapia", label: "Fyzioterapia" },
  { code: 11, kind: "directory", category: "dalsie-sluzby", label: "Ďalšie služby" },
  { code: 12, kind: "directory", category: "psie-skoly", label: "Psie školy (staré)" },
  { code: 13, kind: "directory", category: "utulky-a-zachrana", label: "Útulky a záchrana (staré)" },
  { code: 14, kind: "events", category: null, label: "Podujatia" },
  { code: 15, kind: "articles", category: null, label: "Články a novinky" },
  { code: 16, kind: "adoptions", category: null, label: "Adopcie" },
  { code: 17, kind: "lost-found", category: null, label: "Stratené a nájdené psy" },
  { code: 18, kind: "organizations", category: null, label: "Organizácie a útulky" },
  { code: 19, kind: "help", category: "docasna-opatera", label: "Dočasná opatera" },
  { code: 20, kind: "help", category: "zbierky", label: "Zbierky a výzvy" },
  { code: 21, kind: "help", category: "dobrovolnictvo", label: "Dobrovoľníctvo" },
  { code: 22, kind: "help", category: "urgentne-pripady", label: "Urgentné prípady (staré)" },
  { code: 23, kind: "help", category: "adopcia", label: "Adopcie (staré Help záznamy)" },
  { code: 24, kind: "help", category: "utulky", label: "Útulky (staré Help záznamy)" },
  { code: 25, kind: "help", category: "stratene-a-najdene", label: "Stratené/nájdené (staré Help záznamy)" },
  { code: 26, kind: "eshops", category: null, label: "E-shopy" },
  { code: 27, kind: "directory", category: null, label: "Ostatné/staré adresárové kategórie" },
  { code: 28, kind: "help", category: null, label: "Ostatné/staré Help kategórie" },
] as const;

const byCode = new Map<number, DisplayIdScope>(displayIdScopes.map(scope => [scope.code, scope]));
const byKind = new Map<DisplayIdKind, DisplayIdScope[]>();
for (const scope of displayIdScopes) {
  byKind.set(scope.kind, [...(byKind.get(scope.kind) ?? []), scope]);
}

/** Unknown future categories get a reserved fallback within their own table. */
export function displayIdScope(kind: DisplayIdKind, category?: string | null): DisplayIdScope {
  const scopes = byKind.get(kind);
  if (!scopes?.length) throw Error("DISPLAY_ID_KIND_UNREGISTERED");
  return scopes.find(scope => scope.category === (category ?? null))
    ?? scopes.find(scope => scope.category === null)
    ?? scopes[0];
}

export function formatDisplayId(id: number, kind: DisplayIdKind, category?: string | null): string {
  if (!Number.isSafeInteger(id) || id <= 0) throw Error("DISPLAY_ID_INVALID");
  return String(id) + "/" + displayIdScope(kind, category).code;
}

export type ParsedDisplayId = {id: number; code: number; scope: DisplayIdScope};

/** Text search only; never deserialize this as a D1 foreign key. */
export function parseDisplayId(value: string): ParsedDisplayId | null {
  const match = /^#?([1-9][0-9]{0,14})\s*\/\s*([1-9][0-9]{0,2})$/.exec(value.trim());
  if (!match) return null;
  const id = Number(match[1]), code = Number(match[2]);
  const scope = byCode.get(code);
  if (!Number.isSafeInteger(id) || !scope) return null;
  return { id, code, scope };
}

/**
 * Unambiguous scope matches the canonical module AND current category.
 * Legacy bare numbers remain supported as a separate search path.
 */
export function displayIdMatches(value: string, id: number,
  kind: DisplayIdKind, category?: string | null): boolean {
  const parsed = parseDisplayId(value);
  return Boolean(parsed && parsed.id === id &&
    parsed.code === displayIdScope(kind, category).code);
}

/** Allow an exact scoped search without mistaking an unknown suffix for free text. */
export function looksLikeDisplayId(value: string): boolean {
  return /^#?[0-9]+\s*\/\s*[0-9]+$/.test(value.trim());
}
