/** The five profile agendas share navigation, not storage or mutation contracts. */
export const adminProfileTypes = [
  { id: "services", label: "Služby a prevádzky", href: "/admin/adresar", createHref: "/admin/adresar/novy", createLabel: "+ Nový profil", description: "Spravuj profily služieb, prevádzok a ich kategórie." },
  { id: "adopcia", label: "Adopcie", href: "/admin/adopcie", createHref: "/admin/adopcie/novy", createLabel: "+ Pridať psa", description: "Spravuj psov na adopciu, ich stav a údaje na overenie." },
  { id: "stratene-a-najdene", label: "Stratené a nájdené psy", href: "/admin/stratene-najdene", createHref: "/admin/stratene-najdene/novy", createLabel: "+ Nové hlásenie", description: "Spravuj hlásenia, moderovanie, publikovanie a duplicity." },
  { id: "organizacie", label: "Organizácie a útulky", href: "/admin/organizacie", createHref: "/admin/organizacie/novy", createLabel: "+ Nová organizácia", description: "Spravuj organizácie, útulky, kontakty a lokality." },
  { id: "ostatna-pomoc", label: "Ostatná pomoc", href: "/admin/pomoc", createHref: "/admin/pomoc/novy", createLabel: "+ Nová výzva", description: "Spravuj dočasnú opateru, zbierky, dobrovoľnícke výzvy a prípady pomoci." },
] as const;

export type AdminProfileType = (typeof adminProfileTypes)[number]["id"];
export const ADMIN_PROFILE_HOME = adminProfileTypes[0].href;

export function profileTypeForHelpCategory(category: string): Exclude<AdminProfileType, "services"> {
  if (category === "utulky" || category === "organizacie") return "organizacie";
  if (category === "adopcia" || category === "stratene-a-najdene") return category;
  return "ostatna-pomoc";
}

export function profileWorkspace(type: AdminProfileType) {
  const item = adminProfileTypes.find((entry) => entry.id === type) ?? adminProfileTypes[0];
  return { eyebrow: "Profily", title: item.label, description: item.description };
}

export function profileQuickHref(category: string, q = "") {
  const params = new URLSearchParams({ category });
  if (q) params.set("q", q);
  return "/admin/pomoc-psom?" + params.toString();
}

/** Only filters meaningful in both list modes are carried across; page restarts. */
export function profileDetailedHref(category: string, q = "") {
  const type = profileTypeForHelpCategory(category);
  const item = adminProfileTypes.find((entry) => entry.id === type)!;
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (category === "utulky") params.set("type", "SHELTER");
  if (type === "ostatna-pomoc" && category !== "ostatna-pomoc") params.set("category", category);
  const query = params.toString();
  return item.href + (query ? "?" + query : "");
}

export function profileTypeForPath(pathname: string) {
  const path = pathname.split("?")[0];
  return adminProfileTypes.find((item) => path === item.href || path.startsWith(item.href + "/"));
}
