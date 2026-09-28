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

export type NewsCategoryGuidance = {
  title: string;
  text: string;
  items: string[];
};

const newsCategoryGuidance: Partial<Record<NewsCategorySlug, NewsCategoryGuidance>> = {
  "zachrana-a-hrdinovia": {
    title: "Príbehy, pri ktorých rozhodujú skutky",
    text: "Sledujeme záchranu psov zo zlých podmienok, úspešné adopcie aj prípady, keď pes pomohol zachrániť človeka. Uvádzame zdroj, miesto a aktuálny výsledok príbehu.",
    items: ["potvrdené informácie od organizácie alebo záchranných zložiek", "jasné oddelenie faktov od nepotvrdených tvrdení", "aktualizácia, keď sa situácia zmení"],
  },
  "veda-a-zdravie": {
    title: "Čo nový objav naozaj znamená",
    text: "Výskum, nové lieky a veterinárne postupy prekladáme do zrozumiteľnej reči. Vysvetlíme, či ide o prvé výsledky, schválenú liečbu alebo iba sľubný smer ďalšieho výskumu.",
    items: ["odkaz na pôvodný výskum alebo odbornú organizáciu", "rozlíšenie štúdie, schválenia a bežnej dostupnosti", "praktický význam bez falošných sľubov"],
  },
  "pracovne-psy": {
    title: "Psy, ktoré pomáhajú tam, kde ide o veľa",
    text: "Záchranárske, asistenčné, policajné aj detekčné psy pri katastrofách, pátraní a každodennej službe. Sledujeme ich prácu, výcvik aj konkrétny prínos.",
    items: ["zásahy a pátracie akcie", "asistenčné a detekčné schopnosti", "ľudia a organizácie za úspechom tímu"],
  },
  "ochrana-a-pravo": {
    title: "Pravidlá, ktoré menia život psov",
    text: "Nové zákony, rozsudky, kontroly chovov a opatrenia na ochranu zvierat vysvetlíme bez právnickej hmly — vrátane toho, odkedy platia a koho sa týkajú.",
    items: ["presný zdroj a dátum účinnosti", "dopad na majiteľov, chovateľov a organizácie", "vývoj závažných prípadov týrania"],
  },
};

export function getNewsCategoryGuidance(slug?: string | null): NewsCategoryGuidance | null {
  const category = getNewsCategory(slug);
  if (!category) return null;
  return newsCategoryGuidance[category.slug] ?? {
    title: category.label,
    text: category.description,
    items: ["overiteľný pôvod informácie", "jasný dátum a kontext", "praktický význam pre ľudí a psy"],
  };
}

export function isNewsCategory(value: string): value is NewsCategorySlug {
  return newsCategories.some((category) => category.slug === value);
}

export function getNewsCategory(slug?: string | null) {
  return newsCategories.find((category) => category.slug === slug) ?? null;
}

