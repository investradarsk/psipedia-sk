export type AdminNavigationItem = {
  label: string;
  href: string;
  matches?: readonly string[];
  exact?: boolean;
};

export type AdminNavigationGroup = {
  label: string;
  items: readonly AdminNavigationItem[];
};

export const adminNavigationGroups: readonly AdminNavigationGroup[] = [
  {
    label: "Prehľad",
    items: [
      { label: "Pracovný prehľad", href: "/admin", exact: true },
      { label: "Upozornenia", href: "/admin/operations" },
    ],
  },
  {
    label: "Obsah",
    items: [
      { label: "Články", href: "/admin/clanky", matches: ["/admin/novy"] },
      { label: "Recenzie a testy", href: "/admin/recenzie" },
      { label: "Šteniatka", href: "/admin/steniatka" },
      { label: "Plemená", href: "/admin/plemena" },
      { label: "Sekcie", href: "/admin/sekcie" },
      { label: "Psie meniny", href: "/admin/meniny" },
    ],
  },
  {
    label: "Portál",
    items: [
      {
        label: "Služby pre psov",
        href: "/admin/sluzby-pre-psov",
        matches: ["/admin/adresar"],
      },
      { label: "Podujatia", href: "/admin/podujatia" },
      {
        label: "Pomoc psom",
        href: "/admin/pomoc-psom",
        matches: ["/admin/pomoc", "/admin/adopcie", "/admin/stratene-najdene", "/admin/organizacie"],
      },
    ],
  },
  {
    label: "Komunita a partneri",
    items: [
      { label: "Profilové recenzie", href: "/admin/recenzie-profilov" },
      { label: "Tipy", href: "/admin/tipy" },
      { label: "Hodnotenia", href: "/admin/hodnotenia" },
      { label: "Dopyty", href: "/admin/dopyty" },
      { label: "Návrhy úprav", href: "/admin/adresar/navrhy" },
      { label: "Partneri", href: "/admin/partners" },
    ],
  },
  {
    label: "Automatizácie a kvalita",
    items: [
      {
        label: "Automatizácie",
        href: "/admin/automatizacie",
        matches: ["/admin/operations/automation"],
      },
      { label: "Kvalita údajov", href: "/admin/kvalita" },
      { label: "Mapy", href: "/admin/mapy", matches: ["/admin/operations/geo"] },
      {
        label: "Nástroje",
        href: "/admin/nastroje",
        matches: ["/admin/import", "/admin/operations/outreach", "/admin/operations/possible-matches"],
      },
    ],
  },
  {
    label: "Nastavenia a prevádzka",
    items: [
      { label: "Aplikácia", href: "/admin/nastavenia" },
      { label: "Navigácia", href: "/admin/navigacia" },
      { label: "Monetizácia", href: "/admin/monetizacia" },
      { label: "Právne", href: "/admin/pravne" },
    ],
  },
] as const;

export const adminNavigationItems = adminNavigationGroups.flatMap((group) => group.items);

function normalizedPath(pathname: string) {
  const value = pathname.split("?")[0]?.split("#")[0] || "/admin";
  return value.length > 1 && value.endsWith("/") ? value.slice(0, -1) : value;
}

function pathMatchesPrefix(pathname: string, prefix: string, exact = false) {
  const path = normalizedPath(pathname);
  const candidate = normalizedPath(prefix);
  return exact ? path === candidate : path === candidate || path.startsWith(candidate + "/");
}

function itemMatchScore(pathname: string, item: AdminNavigationItem) {
  const candidates = [item.href, ...(item.matches ?? [])];
  let score = -1;
  for (const candidate of candidates) {
    const exact = item.exact && candidate === item.href;
    if (pathMatchesPrefix(pathname, candidate, exact)) score = Math.max(score, normalizedPath(candidate).length);
  }
  return score;
}

export function findActiveAdminNavigationItem(pathname: string) {
  return adminNavigationItems
    .map((item) => ({ item, score: itemMatchScore(pathname, item) }))
    .filter(({ score }) => score >= 0)
    .sort((a, b) => b.score - a.score)[0]?.item ?? null;
}

function detailLabel(pathname: string) {
  const path = normalizedPath(pathname);
  if (/\/(novy|nove)$/.test(path)) return "Nový záznam";
  if (/\/audit$/.test(path)) return "Audit";
  if (/\/pokrytie$/.test(path)) return "Pokrytie";
  if (/\/prehlad$/.test(path)) return "Prehľad";
  if (/\/zdroje$/.test(path)) return "Zdroje";
  if (/\/zmeny-stavu$/.test(path)) return "Zmeny stavu";
  if (/\/adresy$/.test(path)) return "Adresy";
  return "Detail";
}

export function getAdminBreadcrumbs(pathname: string) {
  const active = findActiveAdminNavigationItem(pathname);
  if (!active || normalizedPath(pathname) === "/admin") {
    return [{ label: "Pracovný prehľad", href: "/admin", current: true }] as const;
  }

  const breadcrumbs: Array<{ label: string; href: string; current?: boolean }> = [
    { label: "Pracovný prehľad", href: "/admin" },
    { label: active.label, href: active.href },
  ];

  if (normalizedPath(pathname) !== normalizedPath(active.href)) {
    breadcrumbs.push({ label: detailLabel(pathname), href: normalizedPath(pathname), current: true });
  } else {
    breadcrumbs[breadcrumbs.length - 1] = { ...breadcrumbs[breadcrumbs.length - 1], current: true };
  }

  return breadcrumbs;
}
