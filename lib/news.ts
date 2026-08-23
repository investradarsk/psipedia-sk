export const newsCategories = [
  {
    slug: "zachrana-a-hrdinovia",
    label: "Záchrana a hrdinovia",
    shortLabel: "Záchrana",
    icon: "❤️",
    description: "Psy zachránené zo zlých podmienok aj príbehy psov, ktoré pomohli ľuďom.",
  },
  {
    slug: "veda-a-zdravie",
    label: "Veda a zdravie",
    shortLabel: "Veda",
    icon: "🔬",
    description: "Nové lieky, veterinárny výskum, prevencia a objavy dôležité pre zdravie psov.",
  },
  {
    slug: "pracovne-psy",
    label: "Pracovné a záchranárske psy",
    shortLabel: "Pracovné psy",
    icon: "🦺",
    description: "Zásahy pri katastrofách, vyhľadávanie ľudí, asistencia aj služobná kynológia.",
  },
  {
    slug: "ochrana-a-pravo",
    label: "Ochrana a právo",
    shortLabel: "Ochrana",
    icon: "⚖️",
    description: "Zmeny zákonov, prípady týrania, kontroly chovov a rozhodnutia, ktoré ovplyvnia psy.",
  },
  {
    slug: "zo-sveta",
    label: "Zo sveta psov",
    shortLabel: "Zo sveta",
    icon: "🌍",
    description: "Dôležité udalosti, rekordy a príbehy zo Slovenska aj zo zahraničia.",
  },
  {
    slug: "zaujimavosti",
    label: "Zaujímavosti",
    shortLabel: "Zaujímavosti",
    icon: "✨",
    description: "Prekvapivé psie schopnosti, výnimočné výkony a témy, ktoré stoja za zdieľanie.",
  },
] as const;

export type NewsCategorySlug = (typeof newsCategories)[number]["slug"];

export function isNewsCategory(value: string): value is NewsCategorySlug {
  return newsCategories.some((category) => category.slug === value);
}

export function getNewsCategory(slug?: string | null) {
  return newsCategories.find((category) => category.slug === slug) ?? null;
}

