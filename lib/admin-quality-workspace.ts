/** One route registry for the quality workspace, breadcrumbs and Ctrl+K. */
export const QUALITY_HOME = "/admin/kvalita";
export const qualityTabs = [
  { id: "findings", label: "Nálezy na schválenie", href: QUALITY_HOME, description: "Návrhy na doplnenie údajov. Zápis do profilu vyžaduje schválenie." },
  { id: "missing", label: "Chýbajúce polia", href: "/admin/kvalita/prehlad", description: "Aktuálne nevyplnené údaje a evidované výnimky." },
  { id: "seo", label: "SEO audit", href: "/admin/kvalita/seo", description: "Kontrola uložených SEO údajov publikovaných záznamov bez automatických opráv." },
  { id: "links", label: "Kontrola odkazov", href: "/admin/kontrola-odkazov", description: "Overenie interných odkazov verejného webu bez zápisov." },
] as const;
export type QualityTab = (typeof qualityTabs)[number]["id"];

export function qualityWorkspace(active: QualityTab) {
  const tab = qualityTabs.find((item) => item.id === active)!;
  return { eyebrow: "Kvalita údajov", title: tab.label, description: tab.description };
}

export function qualityTabForPath(pathname: string) {
  const path = pathname.split(/[?#]/)[0].replace(/\/$/, "");
  return qualityTabs.find((tab) => tab.href === path);
}
