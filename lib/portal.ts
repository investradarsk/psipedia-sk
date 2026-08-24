import type { Article } from "@/lib/content";
import { newsCategories } from "@/lib/news";

export const articlePortalSectionSlugs = [
  "clanky",
  "novinky",
  "steniatka",
  "starostlivost",
  "aktivity",
  "podujatia",
  "adresar",
  "pomoc-psom",
  "recenzie",
] as const;

export type ArticlePortalSection = (typeof articlePortalSectionSlugs)[number];

export type PortalSubpage = {
  slug: string;
  label: string;
  description: string;
  intro?: string;
  imageUrl?: string;
  imageAlt?: string;
  href?: string;
};

export type PortalSection = {
  slug: string;
  label: string;
  navLabel?: string;
  icon: string;
  accent: "forest" | "coral" | "gold" | "blue";
  eyebrow: string;
  description: string;
  intro: string;
  subpages: PortalSubpage[];
  articleEnabled: boolean;
};

export const portalSections: PortalSection[] = [
  {
    slug: "novinky",
    label: "Novinky",
    navLabel: "Novinky",
    icon: "🗞️",
    accent: "blue",
    eyebrow: "Psí svet práve teraz",
    description: "Silné príbehy, dôležité zmeny a overené správy zo sveta psov na jednom mieste.",
    intro: "Sledujeme záchranu psov, hrdinské zásahy, vedu, nové lieky, zákony aj udalosti, ktoré majú skutočný dosah. Každú správu zasadíme do súvislostí a uvedieme jej zdroj.",
    articleEnabled: true,
    subpages: [
      ...newsCategories.map((category) => ({
        slug: category.slug,
        label: category.label,
        description: category.description,
      })),
      { slug: "poslat-tip", label: "Pošli tip redakcii", description: "Upozorni nás na silný príbeh, výskum alebo dôležitú udalosť.", href: "/novinky/poslat-tip" },
    ],
  },
  {
    slug: "steniatka",
    label: "Šteniatka",
    icon: "🐶",
    accent: "coral",
    eyebrow: "Dobrý začiatok",
    description: "Od rozhodnutia až po prvý rok: pokojný a praktický sprievodca životom so šteniatkom.",
    intro: "Prvé mesiace formujú zdravie, vzťah aj budúce správanie psa. Tu nájdeš postupy zoradené podľa toho, čo práve riešiš.",
    articleEnabled: true,
    subpages: [
      { slug: "pred-kupou-psa", label: "Pred kúpou psa", description: "Rozhodnutie, pripravenosť domácnosti, čas, náklady a zodpovednosť." },
      { slug: "vyber-plemena", label: "Výber plemena", description: "Povaha, veľkosť, aktivita a potreby plemena podľa tvojho života." },
      { slug: "vyber-chovatela", label: "Výber chovateľa", description: "Ako spoznať zodpovedný chov, overiť zdravie rodičov a vyhnúť sa množiteľom." },
      { slug: "prve-dni", label: "Prvé dni doma", description: "Režim, spánok, čistotnosť a pokojné zoznámenie s domácnosťou." },
      { slug: "socializacia", label: "Socializácia", description: "Dobré skúsenosti s ľuďmi, psami, prostredím a manipuláciou." },
      { slug: "hygiena", label: "Hygiena", description: "Čistotnosť, srsť, pazúry, zuby, uši a pokojná manipulácia." },
      { slug: "krmenie", label: "Kŕmenie", description: "Dávka, režim, zmena krmiva a sledovanie zdravej kondície." },
      { slug: "ockovanie-a-zdravie", label: "Očkovanie a zdravie", description: "Očkovanie, odčervenie, prevencia a situácie, keď volať veterinára." },
      { slug: "vycvik-steniatka", label: "Výcvik šteniatka", description: "Meno, privolanie, vodítko a základy spolupráce bez nátlaku." },
      { slug: "rast-a-vyvoj", label: "Rast a vývoj", description: "Vývoj tela a správania, výmena zubov, pohyb a primerané zaťaženie." },
      { slug: "puberta", label: "Puberta", description: "Zmeny správania, hranice, emócie a tréning počas dospievania." },
    ],
  },
  {
    slug: "plemena",
    label: "Plemená",
    icon: "🐕",
    accent: "forest",
    eyebrow: "Atlas FCI",
    description: "Charakter, potreby a reálny život s plemenami zo všetkých desiatich skupín FCI.",
    intro: "Porovnaj si povahu, aktivitu, veľkosť aj nároky a vyberaj podľa svojho života, nie iba podľa vzhľadu.",
    articleEnabled: false,
    subpages: [
      { slug: "atlas", label: "Atlas plemien", description: "Prehľad plemien podľa medzinárodného členenia FCI.", href: "/plemena" },
      { slug: "porovnanie", label: "Porovnať plemená", description: "Dve plemená vedľa seba podľa praktických vlastností.", href: "/porovnat-plemena" },
      { slug: "vyber-plemena", label: "Ako vybrať plemeno", description: "Otázky, ktoré si položiť ešte pred rozhodnutím." },
      { slug: "kluby-plemien", label: "Kluby plemien", description: "Organizácie zastrešujúce konkrétne plemená na Slovensku.", href: "/adresar/chovatelske-kluby" },
    ],
  },
  {
    slug: "starostlivost",
    label: "Starostlivosť",
    icon: "🩺",
    accent: "blue",
    eyebrow: "Každodenná poradňa",
    description: "Zdravie, výživa, výcvik aj správanie vysvetlené v súvislostiach.",
    intro: "Vyber si oblasť a nájdi zrozumiteľný postup, varovné signály aj hranicu, kedy už patrí problém odborníkovi.",
    articleEnabled: true,
    subpages: [
      { slug: "zdravie", label: "Zdravie", description: "Prevencia, príznaky, prvá pomoc a návšteva veterinára." },
      { slug: "vyziva", label: "Výživa", description: "Krmivá, dávky, kondícia a rozhodovanie bez marketingových mýtov." },
      { slug: "vycvik", label: "Výcvik", description: "Praktické postupy postavené na dôvere a zrozumiteľných pravidlách." },
      { slug: "spravanie", label: "Správanie", description: "Strach, samota, štekanie, reaktivita a emócie psa." },
      { slug: "srst-a-hygiena", label: "Srsť a hygiena", description: "Česanie, kúpanie, pazúry, zuby a uši." },
      { slug: "senior", label: "Psí senior", description: "Pohyb, pohodlie, výživa a zmeny v staršom veku." },
    ],
  },
  {
    slug: "aktivity",
    label: "Aktivity",
    icon: "🥾",
    accent: "gold",
    eyebrow: "Spoločné zážitky",
    description: "Psie športy, výlety a miesta, kde si môžete deň užiť spolu.",
    intro: "Nájdi aktivitu podľa kondície psa, svojich skúseností a času, ktorý máte k dispozícii.",
    articleEnabled: true,
    subpages: [
      { slug: "psie-sporty", label: "Psie športy", description: "Agility, obedience, nosework, canicross, aporty a ďalšie disciplíny." },
      { slug: "vylety-so-psom", label: "Výlety so psom", description: "Trasy, náročnosť, pravidlá a praktická výbava." },
      { slug: "dog-friendly-miesta", label: "Dog-friendly miesta", description: "Miesta, kde sú psy vítané a podmienky sú jasné vopred." },
      { slug: "dovolenka-so-psom", label: "Dovolenka so psom", description: "Ubytovanie, cestovanie, doklady a bezpečný režim." },
    ],
  },
  {
    slug: "podujatia",
    label: "Podujatia",
    icon: "📅",
    accent: "coral",
    eyebrow: "Čo sa deje",
    description: "Kalendár výstav, pretekov, seminárov, tréningov a stretnutí.",
    intro: "Podujatia budú zoradené podľa dátumu, kraja a typu, aby si rýchlo našiel program vo svojom okolí.",
    articleEnabled: true,
    subpages: [
      { slug: "kalendar", label: "Kalendár podujatí", description: "Všetky termíny na jednom mieste s praktickými filtrami." },
      { slug: "vystavy", label: "Výstavy", description: "Národné, medzinárodné a klubové výstavy psov." },
      { slug: "preteky", label: "Preteky", description: "Športové súťaže a skúšky podľa disciplíny." },
      { slug: "seminare", label: "Semináre a tréningy", description: "Vzdelávanie, workshopy a otvorené skupinové tréningy." },
      { slug: "pridat-podujatie", label: "Pridať podujatie", description: "Priestor pre organizátorov po redakčnom overení." },
    ],
  },
  {
    slug: "adresar",
    label: "Služby pre psov",
    icon: "📍",
    accent: "forest",
    eyebrow: "Nájdi pomoc nablízku",
    description: "Veterinári, tréneri, školy, kluby a praktické služby na jednom mieste.",
    intro: "Profily budú filtrované podľa kraja, zamerania a typu služby. Dopyt na trénera odošleš cez Psipediu.",
    articleEnabled: true,
    subpages: [
      { slug: "veterinari", label: "Veterinári", description: "Ambulancie, kliniky, pohotovosti a ich zameranie." },
      { slug: "treneri", label: "Psí tréneri", description: "Individuálny výcvik, správanie, šteniatka a špecializované tréningy." },
      { slug: "psie-skoly", label: "Psie školy", description: "Skupinové kurzy, socializácia a pravidelné tréningy." },
      { slug: "kynologicke-kluby", label: "Kynologické kluby", description: "Cvičiská, športové kluby a miestne kynologické organizácie." },
      { slug: "chovatelske-kluby", label: "Chovateľské kluby", description: "Oficiálne kluby zastrešujúce jednotlivé plemená." },
      { slug: "chovatelske-stanice", label: "Chovateľské stanice", description: "Profily chovateľských staníc podľa plemena a kraja." },
      { slug: "salony-a-sluzby", label: "Salóny", description: "Úprava srsti a pravidelná starostlivosť." },
      { slug: "hotely-a-opatrovanie", label: "Hotely a opatrovanie", description: "Ubytovanie a opatrovanie počas neprítomnosti." },
      { slug: "vencenie", label: "Venčenie", description: "Pravidelné aj jednorazové venčenie psov." },
      { slug: "fyzioterapia", label: "Fyzioterapia", description: "Rehabilitácia, regenerácia a podpora pohybu." },
      { slug: "dalsie-sluzby", label: "Ďalšie služby", description: "Ďalšie praktické služby pre psov a ich ľudí." },
    ],
  },
  {
    slug: "pomoc-psom",
    label: "Pomoc psom",
    icon: "❤️",
    accent: "coral",
    eyebrow: "Pomoc, ktorá má cieľ",
    description: "Adopcia, útulky, záchrana, dočasná opatera a overené možnosti pomoci.",
    intro: "Na jednom mieste spojíme ľudí, ktorí chcú pomôcť, s overenými útulkami, organizáciami a konkrétnymi prípadmi.",
    articleEnabled: true,
    subpages: [
      { slug: "adopcia", label: "Psy na adopciu", description: "Psy hľadajúce bezpečný a zodpovedný domov." },
      { slug: "utulky", label: "Útulky a organizácie", description: "Overené zariadenia a záchranné občianske združenia." },
      { slug: "docasna-opatera", label: "Dočasná opatera", description: "Pomoc psovi na čas, kým nájde trvalý domov." },
      { slug: "zbierky", label: "Zbierky a výzvy", description: "Transparentné výzvy overené pred zverejnením." },
      { slug: "stratene-a-najdene", label: "Stratené a nájdené psy", description: "Rýchle zdieľanie dôležitých informácií a uzatvorenie prípadu." },
      { slug: "dobrovolnictvo", label: "Ako pomôcť", description: "Venčenie, prevoz, fotografovanie aj materiálna pomoc." },
    ],
  },
  {
    slug: "recenzie",
    label: "Recenzie a testy",
    icon: "⭐",
    accent: "gold",
    eyebrow: "Testy bez marketingovej hmly",
    description: "Praktické skúsenosti s krmivami, výbavou, hračkami a cestovateľskými produktmi.",
    intro: "Pri každej recenzii bude jasné, čo sme hodnotili, pre akého psa je produkt určený a či bol obsah podporený partnerom.",
    articleEnabled: true,
    subpages: [
      { slug: "krmiva", label: "Krmivá", description: "Zloženie, použitie, energia a praktické hodnotenie." },
      { slug: "maskrty", label: "Maškrty", description: "Tréningové odmeny, žuvanie a každodenné používanie." },
      { slug: "hracky", label: "Hračky", description: "Odolnosť, bezpečnosť a vhodnosť podľa typu hry." },
      { slug: "postroje-a-vodidla", label: "Postroje a vodidlá", description: "Pohodlie, ovládanie a bezpečnosť pri pohybe." },
      { slug: "gps-lokatory", label: "GPS lokátory", description: "Dosah, výdrž, presnosť a praktické používanie." },
      { slug: "peleche", label: "Pelechy", description: "Pohodlie, údržba a vhodnosť podľa veľkosti psa." },
      { slug: "cestovanie", label: "Cestovanie", description: "Autovýbava, nosiče, fľaše a veci na výlet." },
      { slug: "vycvikova-vybava", label: "Výcviková výbava", description: "Pomôcky pre bezpečný a zrozumiteľný tréning." },
    ],
  },
];

export const articlePortalSectionOptions = [
  { slug: "clanky", label: "Všeobecné články" },
  ...portalSections
    .filter((section) => section.articleEnabled)
    .map((section) => ({ slug: section.slug as ArticlePortalSection, label: section.label })),
];

export function getPortalSection(slug: string) {
  return portalSections.find((section) => section.slug === slug) ?? null;
}

export function getPortalSubpage(sectionSlug: string, subpageSlug: string) {
  const section = getPortalSection(sectionSlug);
  const subpage = section?.subpages.find((item) => item.slug === subpageSlug) ?? null;
  return section && subpage ? { section, subpage } : null;
}

export function portalSubpageHref(section: Pick<PortalSection, "slug">, subpage: PortalSubpage) {
  return subpage.href ?? `/${section.slug}/${subpage.slug}`;
}

export function isArticlePortalSection(value: string): value is ArticlePortalSection {
  return (articlePortalSectionSlugs as readonly string[]).includes(value);
}

export function articlePortalSection(article: Pick<Article, "portalSection">): ArticlePortalSection {
  return article.portalSection && isArticlePortalSection(article.portalSection) ? article.portalSection : "clanky";
}

export function articleHref(article: Pick<Article, "slug" | "portalSection">) {
  const section = articlePortalSection(article);
  return section === "clanky" ? `/clanky/${article.slug}` : `/${section}/${article.slug}`;
}

export function portalSectionLabel(slug: string) {
  if (slug === "clanky") return "Všeobecné články";
  return getPortalSection(slug)?.label ?? "Články";
}
