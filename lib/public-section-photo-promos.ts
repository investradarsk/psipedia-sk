import type { EventType } from "@/lib/events";
import type { PublicPhotoCalloutData } from "@/components/public-visual-system/public-photo-callout";

/**
 * Copy-only presets for the six approved top-level editorial/directory hubs.
 * They reuse the exact photo + CTA rendering from Pomoc psom.
 * No banners are added to Breeds, detail pages or other sections.
 */
export const publicSectionPhotoPromos = {
  events: {
    eyebrow: "Výcvik a príprava",
    title: "Dobrá príprava je základ každého podujatia",
    text: "Práca so psom, tréning a vhodná záťaž pomáhajú pripraviť sa na spoločné aktivity aj prvé preteky.",
    href: "/aktivity/trening",
    action: "Tipy na tréning",
    tone: "volunteer",
  },
  services: {
    eyebrow: "Zdravie a prevencia",
    title: "Správny odborník pre vášho psa",
    text: "Od pravidelnej prevencie po riešenie zdravotných ťažkostí: nájdite veterinárnu starostlivosť podľa svojho mesta.",
    href: "/adresar/veterinari",
    action: "Nájsť veterinára",
    tone: "care",
  },
  reviews: {
    eyebrow: "Rozhodovanie s prehľadom",
    title: "Vyberajte výbavu podľa potrieb svojho psa",
    text: "Praktické sprievodce, porovnania a zrozumiteľne označené redakčné testy na jednom mieste.",
    href: "/recenzie?typ=produkty#obsah-recenzie",
    action: "Pozrieť recenzie produktov",
    tone: "rescue",
  },
  steniatka: {
    eyebrow: "Prvé dni doma",
    title: "Pokojný začiatok so šteniatkom",
    text: "Prvá noc, bezpečné prostredie a každodenný režim. Začnite malými krokmi, ktoré šteniatku uľahčia zmenu.",
    href: "/steniatka/prve-dni",
    action: "Prvé dni so šteniatkom",
    tone: "rescue",
  },
  starostlivost: {
    eyebrow: "Zdravie psa",
    title: "Všímajte si zmeny včas",
    text: "Prevencia, varovné príznaky aj situácie, keď je vhodné obrátiť sa na veterinára.",
    href: "/starostlivost/zdravie",
    action: "Prejsť na zdravie",
    tone: "care",
  },
  aktivity: {
    eyebrow: "Výchova a výcvik",
    title: "Spolupráca sa buduje každý deň",
    text: "Krátke tréningy, motivácia a vhodné návyky sú základom bezpečného a zrozumiteľného výcviku.",
    href: "/aktivity/trening",
    action: "Objaviť tréningy",
    tone: "volunteer",
  },
} as const satisfies Record<
  "events" | "services" | "reviews" | "steniatka" | "starostlivost" | "aktivity",
  PublicPhotoCalloutData
>;

/** Contextual copy only; all placements use the existing magazine banner. */
export const eventCategoryPhotoPromos = {
  "Výstava": { eyebrow: "Chov a plemená", title: "Hľadáte chovateľskú stanicu?", text: "Nájdite chovateľov a informácie o ich chove v adresári.", href: "/adresar/chovatelske-stanice", action: "Chovateľské stanice", tone: "care" },
  "Preteky": publicSectionPhotoPromos.events,
  "Seminár": { eyebrow: "Starostlivosť", title: "Rozšírte si vedomosti o psoch", text: "Praktické informácie o zdraví a každodennej starostlivosti.", href: "/starostlivost", action: "Praktické rady", tone: "care" },
  "Tréning": { eyebrow: "Psie školy", title: "Nájdite trénera pre svojho psa", text: "Vyberte si výcvik podľa zamerania a lokality.", href: "/adresar/treneri", action: "Nájsť trénera", tone: "volunteer" },
  "Stretnutie": publicSectionPhotoPromos.aktivity,
  "Iné": { eyebrow: "Pomoc psom", title: "Zapojte sa do pomoci psom", text: "Objavte aktuálne možnosti pomoci a organizácie.", href: "/pomoc-psom", action: "Pomoc psom", tone: "rescue" },
} as const satisfies Record<EventType, PublicPhotoCalloutData>;
