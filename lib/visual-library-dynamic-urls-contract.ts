/** Shared serializable contract; never import D1/cloudflare into the client bundle. */
export const DYNAMIC_URL_PAGE_SIZE = 75;
export const dynamicUrlKinds = [
  { id: "directory", label: "Služby a profily", template: "/adresar/[category]/[slug]" },
  { id: "organizations", label: "Organizácie", template: "/organizacie/[slug]" },
  { id: "adoptions", label: "Psy na adopciu", template: "/pomoc-psom/adopcia/[slug]" },
  { id: "help", label: "Pomoc psom – prípady", template: "/pomoc-psom/[category]/[slug]" },
  { id: "lost-found", label: "Stratené a nájdené psy", template: "/pomoc-psom/stratene-psy/[slug]" },
  { id: "events", label: "Podujatia", template: "/podujatia/[slug]" },
  { id: "breeds", label: "Plemená", template: "/plemena/[category]/[slug]" },
  { id: "articles", label: "Články", template: "/[section]/[slug]" },
  { id: "eshops", label: "Recenzie e-shopov", template: "/recenzie/eshopy/[slug]" },
] as const;
export type DynamicUrlKind = (typeof dynamicUrlKinds)[number]["id"];
export type DynamicUrlRecord = { id: number | string; label: string; url: string; kind: DynamicUrlKind; detail?: string };
export type DynamicUrlPage = {
  kind: DynamicUrlKind; page: number; pageSize: number; pages: number;
  total: number; items: DynamicUrlRecord[]; searched: string; generatedAt: string;
};
export function isDynamicUrlKind(value: unknown): value is DynamicUrlKind {
  return typeof value === "string" && dynamicUrlKinds.some(item => item.id === value);
}
