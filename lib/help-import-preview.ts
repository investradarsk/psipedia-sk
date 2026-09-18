// Pure comparison logic. The only database access in this preview is the SELECT below.
export type HelpPreviewStatus = "NEW" | "EXISTING_SAME" | "POSSIBLE_DUPLICATE" | "CONFLICT" | "BLOCKED";

export type HelpPreviewRow = {
  index: number;
  title: string;
  slug: string;
  status: HelpPreviewStatus;
  matchedProductionTitle: string | null;
  matchedProductionId: number | null;
  matchedProductionSlug: string | null;
  reason: string;
  safeForImport: boolean;
};

export type HelpPreview = {
  total: number;
  NEW: number;
  EXISTING_SAME: number;
  POSSIBLE_DUPLICATE: number;
  CONFLICT: number;
  BLOCKED: number;
  SAFE_FOR_IMPORT: number;
  rows: HelpPreviewRow[];
};

export type ExistingHelpRow = {
  id: number;
  slug: string;
  title: string;
  category: string;
  status: string;
  excerpt: string;
  description: string;
  organization: string;
  dog_name: string;
  city: string;
  region: string;
  location_note: string;
  contact_note: string;
  action_url: string | null;
};

// The preview accepts only the SELECT surface of D1; write methods are deliberately absent.
type HelpSelectDatabase = { prepare(query: string): { all<T>(): Promise<{ success: boolean; results: T[] }> } };

type Input = Record<string, unknown>;
type Identity = {
  title: string;
  organization: string;
  dogName: string;
  city: string;
  region: string;
  actionUrl: string;
  urls: Set<string>;
};

type MatchResult = { strong: boolean; potential: boolean; signals: string };

function field(row: Input, key: string) { return typeof row[key] === "string" ? (row[key] as string).trim() : ""; }
function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("sk").replace(/[^a-z0-9]+/g, " ").trim();
}
function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);
}
function url(value: string) {
  try { const parsed = new URL(value); return ["https:", "http:"].includes(parsed.protocol) ? parsed : null; }
  catch { return null; }
}
function identity(row: { title: string; organization: string; dogName: string; city: string; region: string; actionUrl: string; contactNote: string; description: string; locationNote: string }): Identity {
  const haystack = [row.actionUrl, row.contactNote, row.description, row.locationNote].join(" ");
  const urls = new Set<string>();
  for (const match of haystack.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    const parsed = url(match[0].replace(/[.,;)]+$/, ""));
    if (!parsed) continue;
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    urls.add(`${host}${parsed.pathname.replace(/\/$/, "")}`.toLowerCase());
  }
  return {
    title: normalized(row.title),
    organization: normalized(row.organization),
    dogName: normalized(row.dogName),
    city: normalized(row.city),
    region: row.region,
    actionUrl: row.actionUrl.trim(),
    urls,
  };
}
function intersects<T>(first: Set<T>, second: Set<T>) { return [...first].some((value) => second.has(value)); }
function signalList(values: Array<string | false>) { return values.filter(Boolean).join(", "); }

function caseMatch(input: Identity, existing: Identity, category: string): MatchResult {
  const title = Boolean(input.title && input.title === existing.title);
  const operator = Boolean(input.organization && input.organization === existing.organization);
  const dogName = Boolean(input.dogName && input.dogName === existing.dogName);
  const city = Boolean(input.city && input.city === existing.city);
  const sameRegion = Boolean(input.region && input.region === existing.region);
  const urlMatch = intersects(input.urls, existing.urls);

  // Case-like categories intentionally ignore shared organization identity by itself.
  // One organization can legitimately publish many dogs, temporary-care appeals,
  // fundraisers and volunteering opportunities.
  const strong =
    (dogName && operator) ||
    (title && operator) ||
    (title && city) ||
    (title && urlMatch) ||
    (dogName && (city || urlMatch)) ||
    (category === "zbierky" && operator && urlMatch);
  const potential =
    strong ||
    (dogName && (operator || city || sameRegion)) ||
    (title && (operator || city || sameRegion || urlMatch)) ||
    (category === "zbierky" && operator && urlMatch);
  return { strong, potential, signals: signalList([title && "názov", dogName && "pes", operator && "organizácia", city && "mesto", urlMatch && "URL výzvy"]) };
}

function matches(input: Identity, existing: Identity, category: string) {
  return caseMatch(input, existing, category);
}

function validate(row: Input, categories: readonly string[], regions: readonly string[]) {
  const errors: string[] = [];
  const title = field(row, "title");
  const slug = field(row, "slug");
  const category = field(row, "category");
  const status = field(row, "status") || "draft"; // Same default as the existing importer.
  const excerpt = field(row, "excerpt");
  const description = field(row, "description");
  const organization = field(row, "organization");
  const city = field(row, "city");
  const region = field(row, "region");
  const actionUrl = field(row, "actionUrl");
  if (!title) errors.push("chýba title");
  if (!slug || slug !== slugify(slug) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) errors.push("slug nie je kanonický alebo platný; preview ho neupravuje");
  if (!categories.includes(category)) errors.push("neplatná category");
  if (categories.includes(slug)) errors.push("slug je vyhradený pre kategóriu");
  if (excerpt.length < 20) errors.push("excerpt má menej ako 20 znakov");
  if (description.length < 40) errors.push("description má menej ako 40 znakov");
  if (!organization) errors.push("chýba organization");
  if (!city) errors.push("chýba city");
  if (!regions.includes(region)) errors.push(`region „${region.slice(0, 100) || "prázdny"}“ musí byť práve jedna platná hodnota; viac krajov sa nesmie skrátiť`);
  if (!["draft", "published"].includes(status)) errors.push("neplatný status");
  if (row.status != null && typeof row.status !== "string") errors.push("status musí byť draft alebo published");
  if (row.actionUrl != null && typeof row.actionUrl !== "string") errors.push("actionUrl musí byť textová URL");
  if (actionUrl && !url(actionUrl)) errors.push("actionUrl musí byť HTTP(S) URL");
  if (!field(row, "actionLabel")) errors.push("chýba actionLabel (povinný text tlačidla)");
  for (const key of ["locationNote", "contactNote"]) if (row[key] != null && typeof row[key] !== "string") errors.push(`${key} musí byť text`);
  const imageUrl = field(row, "imageUrl");
  if (imageUrl && !imageUrl.startsWith("/media/") && !imageUrl.startsWith("/images/") && !/^https:\/\//i.test(imageUrl)) errors.push("imageUrl nie je platná adresa obrázka");
  for (const key of ["goalAmount", "raisedAmount"]) {
    const value = row[key];
    if (value != null && value !== "" && (!Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > 100000000)) errors.push(`${key} musí byť celé nezáporné číslo do 100000000`);
  }
  if (row.goalAmount != null && row.goalAmount !== "" && row.raisedAmount != null && row.raisedAmount !== "" && Number(row.raisedAmount) > Number(row.goalAmount) * 10) errors.push("vyzbieraná suma výrazne presahuje cieľ");
  for (const key of ["reportedDate", "deadlineDate"]) {
    const value = row[key];
    if (value != null && value !== "" && (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T12:00:00Z`)))) errors.push(`${key} nie je platný dátum`);
  }
  if (category === "zbierky" && status === "published" && (row.verified !== true || !actionUrl || !row.goalAmount)) errors.push("publikovaná zbierka musí byť overená, mať URL a cieľ");
  // Created/updated timestamps are importer metadata, not source facts; preview never invents them.
  return errors;
}

function productionIdentity(row: ExistingHelpRow) {
  return identity({ title: row.title, organization: row.organization, dogName: row.dog_name ?? "", city: row.city, region: row.region, actionUrl: row.action_url ?? "", contactNote: row.contact_note, description: row.description, locationNote: row.location_note });
}
function inputIdentity(row: Input) {
  return identity({ title: field(row, "title"), organization: field(row, "organization"), dogName: field(row, "dogName"), city: field(row, "city"), region: field(row, "region"), actionUrl: field(row, "actionUrl"), contactNote: field(row, "contactNote"), description: field(row, "description"), locationNote: field(row, "locationNote") });
}
function sameDetails(row: Input, existing: ExistingHelpRow) {
  return [
    [field(row, "title"), existing.title], [field(row, "organization"), existing.organization],
    [field(row, "city"), existing.city], [field(row, "region"), existing.region],
    [field(row, "excerpt"), existing.excerpt], [field(row, "description"), existing.description],
    [field(row, "locationNote"), existing.location_note], [field(row, "contactNote"), existing.contact_note],
    [field(row, "actionUrl"), existing.action_url ?? ""], [field(row, "status") || "draft", existing.status],
  ].every(([left, right]) => normalized(left) === normalized(right));
}

export function classifyHelpItems(items: unknown[], existing: ExistingHelpRow[], categories: readonly string[], regions: readonly string[]): HelpPreview {
  const rows: HelpPreviewRow[] = [];
  const keys = new Map<string, number[]>();
  const identities = items.map((item) => item && typeof item === "object" && !Array.isArray(item) ? inputIdentity(item as Input) : null);
  const itemCategories = items.map((item) => item && typeof item === "object" && !Array.isArray(item) ? field(item as Input, "category") : "");
  items.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return;
    const row = item as Input;
    const key = `${field(row, "category")}\u0000${field(row, "slug")}`;
    keys.set(key, [...(keys.get(key) ?? []), index + 1]);
  });
  for (const [index, item] of items.entries()) {
    const row = item && typeof item === "object" && !Array.isArray(item) ? item as Input : null;
    const title = row ? field(row, "title") : "";
    const slug = row ? field(row, "slug") : "";
    const category = row ? field(row, "category") : "";
    const result: HelpPreviewRow = { index: index + 1, title, slug, status: "BLOCKED", matchedProductionTitle: null, matchedProductionId: null, matchedProductionSlug: null, reason: "", safeForImport: false };
    const errors = row ? validate(row, categories, regions) : ["riadok nie je objekt"];
    const duplicateRows = keys.get(`${category}\u0000${slug}`) ?? [];
    if (duplicateRows.length > 1) errors.push(`rovnaký (category, slug) vo vstupných riadkoch ${duplicateRows.join(", ")}`);
    if (errors.length) { result.reason = errors.join("; "); rows.push(result); continue; }
    const exact = existing.find((candidate) => candidate.category === category && candidate.slug === slug);
    if (exact) {
      result.matchedProductionTitle = exact.title;
      result.matchedProductionId = exact.id;
      result.matchedProductionSlug = exact.slug;
      const inputId = identities[index]!;
      const match = matches(inputId, productionIdentity(exact), category);
      result.status = match.strong && sameDetails(row!, exact) ? "EXISTING_SAME" : "CONFLICT";
      result.reason = result.status === "EXISTING_SAME" ? "Rovnaký (category, slug), identita a údaje." : "Kolízia (category, slug): existujúce údaje nie sú ekvivalentné; neprepisovať.";
      rows.push(result); continue;
    }
    const candidates = existing
      .filter((candidate) => candidate.category === category)
      .map((candidate) => ({ candidate, match: matches(identities[index]!, productionIdentity(candidate), category) }))
      .filter(({ match }) => match.potential);
    if (candidates.length) {
      const { candidate, match } = candidates.sort((a, b) => Number(b.match.strong) - Number(a.match.strong) || a.candidate.id - b.candidate.id)[0];
      result.status = "POSSIBLE_DUPLICATE";
      result.matchedProductionTitle = candidate.title;
      result.matchedProductionId = candidate.id;
      result.matchedProductionSlug = candidate.slug;
      result.reason = `Možná vecná duplicita v rovnakej kategórii (${match.signals || "podobná identita"}); ${candidates.length} produkčných kandidátov. Rozhodnúť ručne.`;
      rows.push(result); continue;
    }
    const internal = identities.some((other, otherIndex) => otherIndex !== index && other && itemCategories[otherIndex] === category && matches(identities[index]!, other, category).potential);
    if (internal) { result.status = "POSSIBLE_DUPLICATE"; result.reason = "Možná vecná duplicita s iným riadkom vstupu v rovnakej kategórii; rozhodnúť ručne."; rows.push(result); continue; }
    result.status = "NEW";
    result.safeForImport = true;
    result.reason = "Validácia prešla; bez slug alebo identitnej zhody v rovnakej kategórii produkcie a vo vstupe.";
    rows.push(result);
  }
  const summary: HelpPreview = { total: rows.length, NEW: 0, EXISTING_SAME: 0, POSSIBLE_DUPLICATE: 0, CONFLICT: 0, BLOCKED: 0, SAFE_FOR_IMPORT: 0, rows };
  for (const row of rows) { summary[row.status] += 1; if (row.safeForImport) summary.SAFE_FOR_IMPORT += 1; }
  return summary;
}

export async function previewHelpItems(database: HelpSelectDatabase, items: unknown[], categories: readonly string[], regions: readonly string[]) {
  // Legacy shelter rows are no longer an import source after the canonical organization cutover.
  // Other help categories still need the complete draft/published table and no LIMIT.
  const result = await database.prepare(`SELECT id, slug, title, category, status, excerpt, description, organization, dog_name, city, region,
    location_note, contact_note, action_url FROM help_cases WHERE category <> 'utulky' ORDER BY id`).all<ExistingHelpRow>();
  if (!result.success || !Array.isArray(result.results)) throw new Error("Nepodarilo sa načítať úplný zoznam help_cases.");
  return classifyHelpItems(items, result.results, categories.filter((category) => category !== "utulky"), regions);
}
