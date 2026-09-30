export const articlePromoVariantKeys = ["v1", "v2", "v3"] as const;

export type ArticlePromoVariantKey = (typeof articlePromoVariantKeys)[number];
export type ArticlePromoVariant = "auto" | ArticlePromoVariantKey;

export type ArticlePromoCopy = {
  kicker: string;
  headline: string;
  body: string;
  ctaLabel?: string;
};

export type ArticlePromoTarget = {
  label: string;
  href: string;
  purpose: string;
  ctaLabel: string;
  icon?: string;
  variants: readonly [ArticlePromoCopy, ArticlePromoCopy, ArticlePromoCopy];
};

export const articlePromoRegistry = {
  veterinari: {
    label: "Veterinári",
    href: "/adresar/veterinari",
    purpose: "Vyhľadanie veterinárnych ambulancií, kliník a ďalších veterinárnych pracovísk.",
    ctaLabel: "Nájsť veterinára",
    icon: "medical",
    variants: [
      { kicker: "Služby pre psov", headline: "Hľadáte veterinára?", body: "Pozrite si veterinárne pracoviská v adresári Psipedie." },
      { kicker: "Praktický adresár", headline: "Veterinárna starostlivosť vo vašom okolí", body: "Vyhľadajte ambulancie, kliniky a ďalšie veterinárne pracoviská.", ctaLabel: "Pozrieť veterinárov" },
      { kicker: "Psipedia adresár", headline: "Potrebujete veterinárne pracovisko?", body: "Prejdite si dostupné profily veterinárov podľa lokality.", ctaLabel: "Otvoriť adresár veterinárov" },
    ],
  },
  treneri: {
    label: "Psí tréneri a psie školy",
    href: "/adresar/treneri",
    purpose: "Vyhľadanie trénerov, psích škôl a výcvikových programov.",
    ctaLabel: "Nájsť trénera",
    icon: "training",
    variants: [
      { kicker: "Výcvik v praxi", headline: "Hľadáte trénera alebo psiu školu?", body: "Nájdite výcvikové služby a trénerov v adresári Psipedie." },
      { kicker: "Služby pre psov", headline: "Pomoc s výcvikom a správaním", body: "Pozrite si trénerov a psie školy podľa lokality a zamerania.", ctaLabel: "Pozrieť trénerov" },
      { kicker: "Psipedia adresár", headline: "Vyberte si vhodný výcvik", body: "Prejdite si profily trénerov, škôl a tréningových programov.", ctaLabel: "Otvoriť výcvikové služby" },
    ],
  },
  "chovatelske-stanice": {
    label: "Chovateľské stanice",
    href: "/adresar/chovatelske-stanice",
    purpose: "Vyhľadanie chovateľských staníc a ich verejných profilov.",
    ctaLabel: "Pozrieť chovateľské stanice",
    icon: "breeding",
    variants: [
      { kicker: "Zodpovedný výber", headline: "Hľadáte chovateľskú stanicu?", body: "Pozrite si dostupné chovateľské stanice v adresári Psipedie." },
      { kicker: "Psipedia adresár", headline: "Chovateľské stanice na jednom mieste", body: "Prejdite si profily staníc a ich dostupné údaje.", ctaLabel: "Otvoriť adresár staníc" },
      { kicker: "Pred výberom šteniatka", headline: "Overte si dostupné profily chovateľov", body: "Začnite prehľadom chovateľských staníc podľa plemena a lokality.", ctaLabel: "Nájsť chovateľskú stanicu" },
    ],
  },
  "chovatelske-kluby": {
    label: "Chovateľské kluby",
    href: "/adresar/chovatelske-kluby",
    purpose: "Vyhľadanie klubov zastrešujúcich plemená, chov a členské aktivity.",
    ctaLabel: "Pozrieť chovateľské kluby",
    icon: "club",
    variants: [
      { kicker: "Plemeno a chov", headline: "Hľadáte chovateľský klub?", body: "Nájdite klub pre konkrétne plemeno alebo skupinu plemien." },
      { kicker: "Psipedia adresár", headline: "Kontakty na chovateľské kluby", body: "Pozrite si dostupné klubové profily a verejné kontaktné údaje.", ctaLabel: "Otvoriť kluby" },
      { kicker: "Informácie o chove", headline: "Spojte sa s príslušným klubom", body: "Prejdite si chovateľské kluby evidované na Psipedii.", ctaLabel: "Nájsť klub" },
    ],
  },
  "kynologicke-kluby": {
    label: "Kynologické kluby",
    href: "/adresar/kynologicke-kluby",
    purpose: "Vyhľadanie miestnych kynologických klubov, cvičísk a športových organizácií.",
    ctaLabel: "Pozrieť kynologické kluby",
    icon: "club",
    variants: [
      { kicker: "Výcvik a šport", headline: "Hľadáte kynologický klub?", body: "Nájdite miestne kluby, cvičiská a kynologické organizácie." },
      { kicker: "Psipedia adresár", headline: "Kynologické kluby podľa lokality", body: "Pozrite si dostupné profily klubov a ich kontaktné údaje.", ctaLabel: "Nájsť klub" },
      { kicker: "Aktivity so psom", headline: "Nájdite klub vo svojom okolí", body: "Prejdite si kynologické kluby evidované na Psipedii.", ctaLabel: "Otvoriť adresár klubov" },
    ],
  },
  salony: {
    label: "Psie salóny",
    href: "/adresar/salony-a-sluzby",
    purpose: "Vyhľadanie psích salónov a služieb pravidelnej starostlivosti.",
    ctaLabel: "Pozrieť psie salóny",
    icon: "grooming",
    variants: [
      { kicker: "Starostlivosť", headline: "Hľadáte psí salón?", body: "Pozrite si salóny a služby starostlivosti v adresári Psipedie." },
      { kicker: "Služby pre psov", headline: "Úprava srsti a pravidelná starostlivosť", body: "Nájdite dostupné salóny podľa lokality.", ctaLabel: "Nájsť salón" },
      { kicker: "Psipedia adresár", headline: "Salóny a služby na jednom mieste", body: "Prejdite si profily služieb zameraných na úpravu a hygienu.", ctaLabel: "Otvoriť salóny" },
    ],
  },
  fyzioterapia: {
    label: "Fyzioterapia",
    href: "/adresar/fyzioterapia",
    purpose: "Vyhľadanie pracovísk psej fyzioterapie, rehabilitácie a regenerácie.",
    ctaLabel: "Nájsť fyzioterapiu",
    icon: "rehab",
    variants: [
      { kicker: "Pohyb a regenerácia", headline: "Hľadáte psiu fyzioterapiu?", body: "Pozrite si rehabilitačné a fyzioterapeutické pracoviská v adresári Psipedie." },
      { kicker: "Služby pre psov", headline: "Rehabilitácia a podpora pohybu", body: "Vyhľadajte fyzioterapiu podľa lokality a dostupných údajov.", ctaLabel: "Pozrieť fyzioterapiu" },
      { kicker: "Psipedia adresár", headline: "Nájdite pracovisko pre rehabilitáciu psa", body: "Prejdite si dostupné profily fyzioterapeutických služieb.", ctaLabel: "Otvoriť adresár fyzioterapie" },
    ],
  },
  mapa: {
    label: "Mapa Psipedie",
    href: "/mapa",
    purpose: "Zobrazenie verejných miest a profilov Psipedie v mapovom prehľade.",
    ctaLabel: "Otvoriť mapu",
    icon: "map",
    variants: [
      { kicker: "Mapa Psipedie", headline: "Pozrite si služby a miesta na mape", body: "Objavte verejné profily Psipedie v geografickom prehľade." },
      { kicker: "Vo vašom okolí", headline: "Hľadajte priamo na mape", body: "Mapa pomáha zorientovať sa v dostupných službách a miestach.", ctaLabel: "Pozrieť mapu" },
      { kicker: "Psipedia mapa", headline: "Kde nájdete služby pre psov?", body: "Otvorte mapový prehľad a pozrite si dostupné verejné body.", ctaLabel: "Zobraziť mapu" },
    ],
  },
  podujatia: {
    label: "Podujatia",
    href: "/podujatia",
    purpose: "Prehľad verejných podujatí pre psov a kynologických akcií.",
    ctaLabel: "Pozrieť podujatia",
    icon: "calendar",
    variants: [
      { kicker: "Kalendár Psipedie", headline: "Hľadáte podujatie so psom?", body: "Pozrite si pripravované výstavy, skúšky, športové a komunitné akcie." },
      { kicker: "Čo sa deje", headline: "Podujatia pre psov na jednom mieste", body: "Prejdite si aktuálny kalendár kynologických a psích podujatí.", ctaLabel: "Otvoriť kalendár" },
      { kicker: "Psipedia podujatia", headline: "Naplánujte si ďalšiu akciu", body: "Vyhľadajte podujatia podľa termínu a dostupných údajov.", ctaLabel: "Nájsť podujatie" },
    ],
  },
  adopcia: {
    label: "Psy na adopciu",
    href: "/pomoc-psom/adopcia",
    purpose: "Prehľad psov, ktoré hľadajú zodpovedný nový domov.",
    ctaLabel: "Pozrieť psy na adopciu",
    icon: "adoption",
    variants: [
      { kicker: "Pomoc psom", headline: "Hľadáte psa na adopciu?", body: "Pozrite si aktuálne profily psov, ktoré hľadajú nový domov." },
      { kicker: "Adopcia", headline: "Dajte šancu psovi, ktorý hľadá domov", body: "Prejdite si dostupný katalóg psov na adopciu.", ctaLabel: "Otvoriť adopcie" },
      { kicker: "Psipedia Pomoc psom", headline: "Psy čakajúce na nový domov", body: "Vyhľadajte adopcie podľa plemena, veku, veľkosti alebo lokality.", ctaLabel: "Nájsť psa na adopciu" },
    ],
  },
  utulky: {
    label: "Útulky a organizácie",
    href: "/pomoc-psom/utulky",
    purpose: "Prehľad útulkov, občianskych združení a organizácií Pomoc psom.",
    ctaLabel: "Pozrieť útulky a organizácie",
    icon: "help",
    variants: [
      { kicker: "Pomoc psom", headline: "Hľadáte útulok alebo organizáciu?", body: "Pozrite si verejné profily organizácií, ktoré pomáhajú psom." },
      { kicker: "Organizácie pomoci", headline: "Útulky a záchranné organizácie", body: "Prejdite si dostupné kontakty a informácie o organizáciách.", ctaLabel: "Otvoriť organizácie" },
      { kicker: "Psipedia Pomoc psom", headline: "Nájdite organizáciu, ktorej môžete pomôcť", body: "Pozrite si útulky a organizácie evidované na Psipedii.", ctaLabel: "Nájsť organizáciu" },
    ],
  },
  "stratene-a-najdene": {
    label: "Stratené a nájdené psy",
    href: "/pomoc-psom/stratene-a-najdene",
    purpose: "Prehľad aktuálnych hlásení o stratených a nájdených psoch.",
    ctaLabel: "Pozrieť hlásenia",
    icon: "search",
    variants: [
      { kicker: "Pomoc psom", headline: "Stratil sa pes alebo ste psa našli?", body: "Pozrite si aktuálne hlásenia o stratených a nájdených psoch." },
      { kicker: "Stratené a nájdené", headline: "Aktuálne hlásenia na jednom mieste", body: "Prejdite si zoznam stratených a nájdených psov.", ctaLabel: "Otvoriť prehľad" },
      { kicker: "Psipedia Pomoc psom", headline: "Pomôžte spojiť psa s majiteľom", body: "Skontrolujte aktuálne hlásenia a dostupné informácie.", ctaLabel: "Pozrieť stratené a nájdené psy" },
    ],
  },
  plemena: {
    label: "Plemená",
    href: "/plemena",
    purpose: "Prehľad plemien psov a ich profilov na Psipedii.",
    ctaLabel: "Pozrieť plemená",
    icon: "breeds",
    variants: [
      { kicker: "Plemená psov", headline: "Chcete si porovnať plemená?", body: "Pozrite si profily plemien a ich základné charakteristiky." },
      { kicker: "Psipedia plemená", headline: "Objavte plemená podľa svojich potrieb", body: "Prejdite si prehľad plemien a dostupné informácie.", ctaLabel: "Otvoriť prehľad plemien" },
      { kicker: "Výber psa", headline: "Začnite pri reálnych potrebách plemena", body: "Pozrite si profily plemien skôr, než sa rozhodnete.", ctaLabel: "Preskúmať plemená" },
    ],
  },
  recenzie: {
    label: "Recenzie a testy",
    href: "/recenzie",
    purpose: "Prehľad redakčných testov, produktových recenzií a skúseností používateľov.",
    ctaLabel: "Pozrieť recenzie a testy",
    icon: "reviews",
    variants: [
      { kicker: "Recenzie a testy", headline: "Hľadáte skúsenosti pred výberom?", body: "Pozrite si redakčné testy a verejné recenzie na Psipedii." },
      { kicker: "Pred nákupom alebo výberom služby", headline: "Porovnajte dostupné skúsenosti", body: "Prejdite si recenzie, testy a hodnotenia na jednom mieste.", ctaLabel: "Otvoriť recenzie" },
      { kicker: "Psipedia recenzie", headline: "Rozhodujte sa s väčším kontextom", body: "Pozrite si dostupné testy produktov a skúsenosti používateľov.", ctaLabel: "Pozrieť hodnotenia" },
    ],
  },
} as const satisfies Record<string, ArticlePromoTarget>;

export type ArticlePromoKey = keyof typeof articlePromoRegistry;

export const articlePromoKeys = Object.keys(articlePromoRegistry) as ArticlePromoKey[];

export function isArticlePromoKey(value: unknown): value is ArticlePromoKey {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(articlePromoRegistry, value);
}

export function getArticlePromoTarget(value: unknown): ArticlePromoTarget | null {
  return isArticlePromoKey(value) ? articlePromoRegistry[value] : null;
}

export function normalizeArticlePromoVariant(value: unknown): ArticlePromoVariant {
  return value === "v1" || value === "v2" || value === "v3" ? value : "auto";
}

export function articlePromoUtcDay(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function selectArticlePromoVariantIndex(
  promoKey: ArticlePromoKey,
  seed: string,
  utcDay = articlePromoUtcDay(),
) {
  return stableHash(`${promoKey}|${seed}|${utcDay}`) % 3;
}

export function resolveArticlePromo(
  promoKey: ArticlePromoKey,
  variant: ArticlePromoVariant,
  seed: string,
  utcDay = articlePromoUtcDay(),
) {
  const target = articlePromoRegistry[promoKey];
  const index = variant === "auto"
    ? selectArticlePromoVariantIndex(promoKey, seed, utcDay)
    : articlePromoVariantKeys.indexOf(variant);
  return {
    target,
    copy: target.variants[index < 0 ? 0 : index],
    variantKey: articlePromoVariantKeys[index < 0 ? 0 : index],
  };
}

type AnchoredBlock = {
  id: string;
  type: string;
};

function isNotionOwnedBlock(block: AnchoredBlock) {
  return block.type !== "psipedia-promo" && block.id.startsWith("notion-");
}

/**
 * Preserves only manual Psipedia promo blocks when a Notion sync replaces the
 * Notion-owned article body. The previous stable Notion block id is the primary
 * anchor; the next surviving Notion block is the secondary anchor. If neither
 * survives, promo blocks are appended in their original order.
 */
export function preserveArticlePromoBlocks<T extends AnchoredBlock>(
  existingBlocks: readonly T[],
  nextNotionBlocks: readonly T[],
): T[] {
  const promos = existingBlocks
    .map((block, index) => ({ block, index }))
    .filter((entry) => entry.block.type === "psipedia-promo");
  if (!promos.length) return [...nextNotionBlocks];

  const nextIds = new Set(nextNotionBlocks.filter(isNotionOwnedBlock).map((block) => block.id));
  const before = new Map<string, T[]>();
  const after = new Map<string, T[]>();
  const fallback: T[] = [];

  const add = (map: Map<string, T[]>, id: string, block: T) => {
    const group = map.get(id) ?? [];
    group.push(block);
    map.set(id, group);
  };

  for (const { block, index } of promos) {
    let previousAnchor: string | null = null;
    let nextAnchor: string | null = null;

    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const candidate = existingBlocks[cursor];
      if (isNotionOwnedBlock(candidate)) {
        previousAnchor = candidate.id;
        break;
      }
    }
    for (let cursor = index + 1; cursor < existingBlocks.length; cursor += 1) {
      const candidate = existingBlocks[cursor];
      if (isNotionOwnedBlock(candidate)) {
        nextAnchor = candidate.id;
        break;
      }
    }

    if (previousAnchor && nextIds.has(previousAnchor)) add(after, previousAnchor, block);
    else if (nextAnchor && nextIds.has(nextAnchor)) add(before, nextAnchor, block);
    else fallback.push(block);
  }

  const merged: T[] = [];
  for (const block of nextNotionBlocks) {
    merged.push(...(before.get(block.id) ?? []));
    merged.push(block);
    merged.push(...(after.get(block.id) ?? []));
  }
  merged.push(...fallback);
  return merged;
}
