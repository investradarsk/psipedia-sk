/** Shared published help CTA content: public site and admin previews use the same values. */
export type HelpBannerPreset = {
  eyebrow: string;
  title: string;
  text: string;
  href: string;
  action: string;
  tone: "care" | "rescue" | "volunteer" | "closing";
};

export type HelpOverviewBannerPreset = Omit<HelpBannerPreset, "tone"> & { tone: "care" | "rescue" | "volunteer" };

export const helpOverviewPromos: Partial<Record<number, HelpOverviewBannerPreset>> = {
  0: {
    eyebrow: "Praktické rady",
    title: "Dobrý nový domov začína prípravou",
    text: "Starostlivosť, zdravie, prvé dni aj každodenné fungovanie so psom nájdete v našich praktických témach.",
    href: "/starostlivost",
    action: "Prejsť na starostlivosť",
    tone: "care",
  },
  2: {
    eyebrow: "Rýchla pomoc",
    title: "Našli ste psa v núdzi?",
    text: "Pozrite si jednoduchý postup: čo urobiť na mieste, koho kontaktovať a ktoré informácie si hneď zaznamenať.",
    href: "/pomoc-psom/nahlasit-psa-v-nudzi",
    action: "Postup krok za krokom",
    tone: "rescue",
  },
  4: {
    eyebrow: "Zapojte sa",
    title: "Pomoc nemusí byť iba finančná",
    text: "Venčenie, prevoz, dočasná opatera, fotografovanie alebo zdieľanie môžu organizáciám výrazne pomôcť.",
    href: "/pomoc-psom/dobrovolnictvo",
    action: "Ako môžem pomôcť",
    tone: "volunteer",
  },
};

export const lostFoundSubmitPromo: HelpOverviewBannerPreset = {
  eyebrow: "Stratený alebo nájdený pes",
  title: "Stratil sa vám pes alebo ste psa našli?",
  text: "Pošlite hlásenie cez krátky formulár. Kontaktné údaje zostanú súkromné a záznam sa zobrazí až po kontrole.",
  href: "/pomoc-psom/stratene-a-najdene/nahlasit",
  action: "Nahlásiť psa",
  tone: "rescue",
};

export const helpClosingPromo: HelpBannerPreset = {
  eyebrow: "Každá pomoc má zmysel",
  title: "Pomáhajme spolu",
  text: "Lepší svet pre psov vzniká vďaka ľuďom, ktorí nechcú zostať bokom.",
  href: "/pomoc-psom/dobrovolnictvo",
  action: "Chcem pomôcť",
  tone: "closing",
};
