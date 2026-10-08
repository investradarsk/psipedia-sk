import { getArticlePromoTarget, type ArticlePromoKey } from "@/lib/article-promo";

/** Directory destinations stay owned by the existing promo registry. */
type Destination = { label: string; promoKey: ArticlePromoKey } | { label: string; href: string };
type Rule = { key: string; headline: string; text: string; lead?: string; primary: Destination; secondary?: Destination; urgent?: boolean };
const promo = (promoKey: ArticlePromoKey, label: string): Destination => ({ promoKey, label });
const page = (href: string, label: string): Destination => ({ href, label });

// Editorial, topic-specific navigation only. No new registry, DB field or publication logic.
const rules: Readonly<Record<string, Rule>> = {
  "starostlivost/zdravie": {
    key: "health-urgent", headline: "Keď ide o čas", lead: "Má pes akútny problém?",
    text: "Pri sťaženom dýchaní, kolapse, silnom krvácaní, nafúknutom tvrdom bruchu alebo podozrení na otravu nečakaj na odpoveď z internetu.",
    primary: page("/starostlivost/kedy-ist-so-psom-k-veterinarovi", "Kedy ísť k veterinárovi"),
    secondary: promo("veterinari", "Nájsť veterinára"), urgent: true,
  },
  "starostlivost/vyziva": {
    key: "care-nutrition", headline: "Keď strava nestačí",
    text: "Pri opakovaných tráviacich ťažkostiach alebo potrebe špeciálnej diéty pomôže odborné posúdenie.",
    primary: promo("veterinari", "Veterinárne pracoviská"),
  },
  "starostlivost/vycvik": {
    key: "care-training", headline: "Pomoc s tréningom",
    text: "Tréner môže pomôcť s nácvikom návykov aj správaním, ktoré sa doma nedarí zvládnuť.",
    primary: promo("treneri", "Tréneri a psie školy"),
  },
  "starostlivost/srst-a-hygiena": {
    key: "care-hygiene", headline: "Pomoc so starostlivosťou o srsť",
    text: "Pri náročnej úprave srsti si môžeš vybrať salón alebo službu pre psov.",
    primary: promo("salony", "Psie salóny a služby"),
  },
  "steniatka/pred-kupou-psa": {
    key: "puppy-before", headline: "Najprv vhodné plemeno",
    text: "Porovnaj potreby plemien so svojím denným režimom skôr, než sa rozhodneš.",
    primary: page("/plemena/vyber-plemena", "Pomoc s výberom plemena"),
  },
  "steniatka/vyber-plemena": {
    key: "puppy-breed", headline: "Porovnaj viac možností",
    text: "Veľkosť a vzhľad sú len začiatok. Porovnaj povahu, aktivitu a nároky jednotlivých plemien.",
    primary: page("/porovnat-plemena", "Porovnať plemená"),
  },
  "steniatka/vyber-chovatela": {
    key: "puppy-breeder", headline: "Kde hľadať chovateľa",
    text: "Prezri si profily chovateľských staníc a over podmienky chovu aj zdravotné vyšetrenia.",
    primary: promo("chovatelske-stanice", "Chovateľské stanice"),
  },
  "steniatka/prve-dni": {
    key: "puppy-first-days", headline: "Prvá veterinárna prehliadka",
    text: "Po príchode šteniatka si dohodni prehliadku a priprav si otázky k očkovaniu a zdraviu.",
    primary: promo("veterinari", "Nájsť veterinára"),
  },
  "steniatka/socializacia": {
    key: "puppy-social", headline: "Socializácia s citlivým vedením",
    text: "Ak potrebuješ pomoc s bezpečným zoznamovaním a prvými návykmi, vyber si skúseného trénera.",
    primary: promo("treneri", "Tréneri a psie školy"),
  },
  "steniatka/vycvik-steniatka": {
    key: "puppy-training", headline: "Základy sa učia postupne",
    text: "Pri prvých poveloch pomôže tréner, ktorý zohľadní vek a sústredenie šteniatka.",
    primary: promo("treneri", "Tréneri a psie školy"),
  },
  "steniatka/ockovanie-a-zdravie": {
    key: "puppy-health", headline: "Zdravotný plán pre šteniatko",
    text: "Očkovanie a odčervenie nastav podľa individuálneho stavu s veterinárom.",
    primary: promo("veterinari", "Veterinári"),
  },
  "steniatka/krmenie": {
    key: "puppy-feeding", headline: "Výživa podľa veku",
    text: "Zorientuj sa v témach výživy, skôr než budeš meniť jedálniček šteniatka.",
    primary: page("/starostlivost/vyziva", "Výživa a starostlivosť"),
  },
  "aktivity/trening": {
    key: "activity-training", headline: "Tréning s odborným vedením",
    text: "Vyber si trénera podľa cieľa, skúseností a potrieb psa.",
    primary: promo("treneri", "Psí tréneri"),
  },
  "aktivity/psie-sporty": {
    key: "activity-sport", headline: "Kde začať so psím športom",
    text: "Kluby pomôžu nájsť vhodnú disciplínu a bezpečne nastaviť začiatky.",
    primary: promo("kynologicke-kluby", "Kynologické kluby"),
  },
};

export type ContentHubCtaAction = {
  label: string; href: string; role: "primary" | "secondary"; promoKey?: ArticlePromoKey;
};
export type ContentHubCtaDecision = {
  key: string; headline: string; lead?: string; text: string;
  actions: readonly ContentHubCtaAction[]; afterArticleCount: number;
};
const hrefOf = (item: Destination) => "promoKey" in item
  ? getArticlePromoTarget(item.promoKey)?.href ?? null
  : item.href;
const canonical = (href: string) => href.split(/[?#]/, 1)[0].replace(/\/$/, "") || "/";

/**
 * At most one deterministic inline placement after three actual articles.
 * Short feeds are free of promotion, except urgent veterinary navigation.
 * Sidebar/manual exclusions use the same canonical destinations as the registry.
 */
export function resolveContentHubCta({
  section, topic, visibleArticleCount, sidebarPromoKey, occupiedPromoKeys = [], occupiedHrefs = [],
}: {
  section: string; topic: string; visibleArticleCount: number;
  sidebarPromoKey?: ArticlePromoKey | null;
  occupiedPromoKeys?: readonly ArticlePromoKey[]; occupiedHrefs?: readonly string[];
}): ContentHubCtaDecision | null {
  const rule = rules[`${section}/${topic}`];
  if (!rule || visibleArticleCount < (rule.urgent ? 1 : 4)) return null;
  const excluded = new Set(occupiedPromoKeys);
  const taken = new Set(occupiedHrefs.map(canonical));
  if (sidebarPromoKey) {
    excluded.add(sidebarPromoKey);
    const sidebarHref = getArticlePromoTarget(sidebarPromoKey)?.href;
    if (sidebarHref) taken.add(canonical(sidebarHref));
  }
  const actions: ContentHubCtaAction[] = [];
  const destinations = [rule.primary, rule.secondary].filter((item): item is Destination => Boolean(item));
  for (const [index, destination] of destinations.entries()) {
    const promoKey = "promoKey" in destination ? destination.promoKey : undefined;
    const href = hrefOf(destination);
    if (!href || (promoKey && excluded.has(promoKey)) || taken.has(canonical(href))) continue;
    // Do not promote a secondary option into a different primary message.
    if (index > 0 && !actions.length) continue;
    actions.push({ label: destination.label, href, role: index ? "secondary" : "primary", ...(promoKey ? { promoKey } : {}) });
    taken.add(canonical(href));
  }
  if (!actions.length) return null;
  return { key: rule.key, headline: rule.headline, lead: rule.lead, text: rule.text, actions,
    afterArticleCount: Math.min(3, visibleArticleCount) };
}
