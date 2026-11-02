import { ContentHubCta } from "./content-hub-cta";
import { PublicActionLink } from "./public-visual-system/public-visual-system";
import { PublicArticleCallout } from "./public-visual-system/public-article-callout";
import { PublicContextBanner } from "./public-visual-system/public-context-banner";
import {
  PublicHelpClosingBanner,
  PublicHelpPhotoBanner,
  PublicHelpReportBanner,
  lostFoundSubmitPromo,
} from "./public-visual-system/public-help-banner";
import { PublicMagazineBanner } from "./public-visual-system/public-magazine-banner";
import { PublicPhotoCallout } from "./public-visual-system/public-photo-callout";
import { PublicTextInput, PublicSelect } from "./public-visual-system/public-form-controls";
import { HomePortalSearch } from "./home-portal-search";
import { SectionHeroSearch } from "./section-hero-search";
import {
  PublicActionButton, PublicArticleListItem, PublicCategoryTiles, PublicContentListItem,
  PublicDataCard, PublicLandingHero, PublicSectionHeader,
} from "./public-visual-system/public-visual-system";
import { PublicSubcategoryNavigator } from "./public-visual-system/public-subcategory-navigator";
import {
  PublicEmptyState, PublicFilterTag, PublicLoadingState, PublicNotice, PublicPagination,
} from "./public-visual-system/public-result-states";
import { PublicContentShell, PublicLandingSectionHeading } from "./public-visual-system/public-landing-layout";
import { PublicMediaFallback } from "./public-visual-system/public-media-fallback";

/**
 * Render the REAL existing public components with hardcoded demo text.
 * This is an admin-only, read-only catalog. No production records, calls,
 * writes, upload buttons or publish actions are used.
 */
export const adminComponentPreviewSamples = [
  { id: "magazine", path: "components/public-visual-system/public-magazine-banner.tsx", family: "banner", title: "Promo banner bez fotografie", description: "Spoločný banner používaný aj na homepage.", featured: true },
  { id: "magazine-photo", path: "components/public-visual-system/public-magazine-banner.tsx", family: "banner", title: "Fotografický promo banner", description: "Rovnaký komponent s originálnou fotografiou.", featured: true },
  { id: "context", path: "components/public-visual-system/public-context-banner.tsx", family: "banner", title: "Informačný banner", description: "Svetlý variant pre súvisiacu tému.", featured: true },
  { id: "context-photo", path: "components/public-visual-system/public-context-banner.tsx", family: "banner", title: "Informačný banner s fotografiou", description: "Tmavý variant s ilustračným médiom." },
  { id: "report", path: "components/public-visual-system/public-help-banner.tsx", family: "banner", title: "Rýchla pomoc", description: "Upozornenie Pomoc psom." },
  { id: "rescue", path: "components/public-visual-system/public-help-banner.tsx", family: "banner", title: "Nahlásenie strateného psa", description: "Fotografický banner Pomoc psom." },
  { id: "closing", path: "components/public-visual-system/public-help-banner.tsx", family: "banner", title: "Záverečná výzva na pomoc", description: "Fotografický záverečný banner." },
  { id: "photo-callout", path: "components/public-visual-system/public-photo-callout.tsx", family: "banner", title: "Spoločná fotografická výzva", description: "Zdieľa vizuál s promo bannerom." },
  { id: "article", path: "components/public-visual-system/public-article-callout.tsx", family: "banner", title: "Výzva v článku", description: "Redakčný CTA variant." },
  { id: "sponsored", path: "components/public-visual-system/public-article-callout.tsx", family: "banner", title: "Partnerská výzva v článku", description: "Zachováva označenie partnerského odkazu." },
  { id: "hub", path: "components/content-hub-cta.tsx", family: "banner", title: "Odporúčací banner", description: "Dve CTA tlačidlá v tematickom hube." },
  { id: "banner-frame", path: "components/public-visual-system/public-banner-frame.tsx", family: "banner", title: "Základ bannerov", description: "Spoločný obal nemá samostatný vzhľad; ukážka je jeho použitie." },
  { id: "actions", path: "components/public-visual-system/public-visual-system.tsx", family: "cta", title: "Spoločné CTA odkazy", description: "Primárny, sekundárny a textový variant." },
  { id: "controls", path: "components/public-visual-system/public-form-controls.tsx", family: "filter", title: "Formulárové ovládanie", description: "Spoločný vstup a výber bez odoslania formulára." },
  { id: "section-header", path: "components/public-visual-system/public-visual-system.tsx", family: "hero", title: "Hlavička sekcie", description: "Reálna spoločná hlavička s titulkom a úvodom." },
  { id: "section-header-image", path: "components/public-visual-system/public-visual-system.tsx", family: "hero", title: "Fotografická hlavička", description: "Skutočný variant spoločnej hlavičky s fotografiou." },
  { id: "landing-hero", path: "components/public-visual-system/public-visual-system.tsx", family: "hero", title: "Úvodný blok sekcie", description: "Spoločný úvodný blok v sekcii služieb." },
  { id: "landing-hero-events", path: "components/public-visual-system/public-visual-system.tsx", family: "hero", title: "Úvodný blok podujatí", description: "Samostatný farebný variant spoločného úvodného bloku." },
  { id: "category-tiles", path: "components/public-visual-system/public-visual-system.tsx", family: "category", title: "Karty kategórií", description: "Spoločný prehľad kategórií a podkategórií." },
  { id: "subcategory-landing", path: "components/public-visual-system/public-subcategory-navigator.tsx", family: "category", title: "Podkategórie s fotografiami", description: "Veľké karty navigácie medzi témami." },
  { id: "subcategory-compact", path: "components/public-visual-system/public-subcategory-navigator.tsx", family: "category", title: "Kompaktná navigácia", description: "Riadok prepínania podkategórií." },
  { id: "data-card", path: "components/public-visual-system/public-visual-system.tsx", family: "card", title: "Dátová karta služby", description: "Spoločná informačná karta bez produkčných údajov." },
  { id: "content-card", path: "components/public-visual-system/public-visual-system.tsx", family: "card", title: "Obsahová karta", description: "Prehľadový prvok s úvodom a odkazom." },
  { id: "article-list", path: "components/public-visual-system/public-visual-system.tsx", family: "card", title: "Riadok článku", description: "Kompaktný zoznam článkov s náhradou fotografie." },
  { id: "section-search", path: "components/section-hero-search.tsx", family: "filter", title: "Vyhľadávanie sekcie", description: "Vyhľadávacie pole a tlačidlo v hlavičke sekcie." },
  { id: "home-search", path: "components/home-portal-search.tsx", family: "filter", title: "Hlavné vyhľadávanie", description: "Skutočné spoločné vyhľadávanie s prázdnym vzorovým dopytom." },
  { id: "action-button", path: "components/public-visual-system/public-visual-system.tsx", family: "cta", title: "Tlačidlá akcie", description: "Tri varianty spoločného akčného tlačidla." },
  { id: "landing-heading", path: "components/public-visual-system/public-landing-layout.tsx", family: "hero", title: "Nadpis obsahovej sekcie", description: "Zdieľaná hlavička blokov na stránke." },
  { id: "content-shell", path: "components/public-visual-system/public-landing-layout.tsx", family: "other", title: "Obsahový kontajner", description: "Ukážka zdieľaného rozloženia s vzorovým obsahom." },
  { id: "empty-state", path: "components/public-visual-system/public-result-states.tsx", family: "other", title: "Prázdny zoznam", description: "Stav, keď sa nenašli žiadne výsledky." },
  { id: "notice", path: "components/public-visual-system/public-result-states.tsx", family: "other", title: "Informačné upozornenie", description: "Skutočná správa používaná vo verejnom rozhraní." },
  { id: "pagination", path: "components/public-visual-system/public-result-states.tsx", family: "other", title: "Stránkovanie", description: "Prechádzanie medzi stranami výsledkov." },
  { id: "filter-tag", path: "components/public-visual-system/public-result-states.tsx", family: "filter", title: "Štítok filtra", description: "Spoločný vizuálny prvok aktívneho filtra." },
  { id: "loading", path: "components/public-visual-system/public-result-states.tsx", family: "other", title: "Načítavanie", description: "Spoločný stav pri načítaní obsahu." },
  { id: "fallback", path: "components/public-visual-system/public-media-fallback.tsx", family: "card", title: "Chýbajúca fotografia", description: "Skutočná náhrada za chýbajúci obrázok." },
] as const;

export type AdminComponentPreviewId = (typeof adminComponentPreviewSamples)[number]["id"];

export function AdminComponentVisualPreview({ id }: { id: AdminComponentPreviewId }) {
  switch (id) {
    case "magazine":
      return <PublicMagazineBanner testId="admin-preview-magazine" title="Objavte služby pre svojho psa"
        description="Nájdite veterinárov, trénerov a ďalších odborníkov." label="Prejsť do adresára" href="/adresar" />;
    case "magazine-photo":
      return <PublicMagazineBanner testId="admin-preview-photo" photoTone="care"
        eyebrow="Starostlivosť o psa" title="Zdravie začína prevenciou"
        description="Overené rady a pomoc odborníkov na jednom mieste." label="Zobraziť zdravie" href="/starostlivost" />;
    case "context":
      return <PublicContextBanner tone="sage" eyebrow="Užitočné informácie" title="Vyberte si vhodné plemeno"
        text="Každý pes má iné potreby. Spoznajte plemená a porovnajte ich." ctaLabel="Atlas plemien" ctaHref="/plemena" />;
    case "context-photo":
      return <PublicContextBanner tone="forest" eyebrow="Pre majiteľov psov" title="Starostlivosť s istotou"
        text="Nájdite služby a dôležité informácie." ctaLabel="Zobraziť služby" ctaHref="/adresar"
        image={{ src: "/images/zdravie-veterinar.webp", alt: "" }} />;
    case "report":
      return <PublicHelpReportBanner />;
    case "rescue":
      return <PublicHelpPhotoBanner promo={lostFoundSubmitPromo} />;
    case "closing":
      return <PublicHelpClosingBanner />;
    case "photo-callout":
      return <PublicPhotoCallout promo={{
        eyebrow: "Pomoc psom", title: "Spolu dokážeme viac",
        text: "Pozrite sa, ako sa môžete zapojiť do pomoci.", action: "Chcem pomôcť",
        href: "/pomoc-psom", tone: "volunteer",
      }} />;
    case "article":
      return <PublicArticleCallout text="Prečítajte si ďalšie odborné články o starostlivosti a výcviku psov."
        href="/clanky" buttonText="Všetky články" />;
    case "sponsored":
      return <PublicArticleCallout sponsored text="Ilustračný príklad partnerského odporúčania."
        href="/recenzie" buttonText="Pozrieť odporúčania" />;
    case "hub":
      return <ContentHubCta cta={{
        key: "preview-only", headline: "Pomoc pri výbere",
        text: "Prečítajte si sprievodcu a nájdite vhodného odborníka.",
        afterArticleCount: 0, actions: [
          { href: "/plemena", label: "Atlas plemien", role: "primary" },
          { href: "/adresar", label: "Nájsť odborníka", role: "secondary" },
        ],
      }} />;
    case "banner-frame":
      return <PublicMagazineBanner testId="admin-preview-frame" compact
        title="Jeden spoločný obal bannerov" description="Konkrétny vzhľad určujú varianty, nie samotný obal." />;
    case "section-header":
      return <PublicSectionHeader eyebrow="Starostlivosť" title="Ako sa starať o psa" intro="Odborné rady a užitočné informácie pre majiteľov psov." />;
    case "section-header-image":
      return <PublicSectionHeader variant="image" eyebrow="Pre majiteľov psov" title="Zdravie psa"
        intro="Prevencia, výživa a každodenná starostlivosť." image={{ src: "/images/zdravie-veterinar.webp", alt: "" }} />;
    case "landing-hero":
      return <PublicLandingHero tone="services" eyebrow="Služby pre psov" title="Nájdite odborníka"
        intro="Veterinári, salóny a tréneri pre vášho psa." />;
    case "landing-hero-events":
      return <PublicLandingHero tone="events" eyebrow="Podujatia" title="Čo sa deje vo vašom okolí"
        intro="Výstavy, športové podujatia a ďalšie stretnutia." />;
    case "category-tiles":
      return <PublicCategoryTiles label="Ukážka kategórií" items={[
        { href: "/adresar/veterinari", title: "Veterinári", description: "Zdravie a prevencia" },
        { href: "/adresar", title: "Psie salóny", description: "Starostlivosť o srsť" },
        { href: "/aktivity", title: "Výcvik", description: "Tréneri a kurzy" },
      ]} />;
    case "subcategory-landing":
      return <PublicSubcategoryNavigator label="Ukážka podkategórií" items={[
        { href: "/starostlivost", title: "Zdravie", description: "Starostlivosť o psa" },
        { href: "/aktivity", title: "Výcvik", description: "Tréning a aktivity" },
        { href: "/plemena", title: "Plemená", description: "Atlas plemien" },
      ]} />;
    case "subcategory-compact":
      return <PublicSubcategoryNavigator mode="compact" label="Ukážka prepínača" items={[
        { href: "/adresar", title: "Všetky", current: true },
        { href: "/adresar/veterinari", title: "Veterinári" },
        { href: "/podujatia", title: "Podujatia" },
      ]} />;
    case "data-card":
      return <PublicDataCard href="/adresar" eyebrow="Služby" title="Veterinárne služby"
        description="Ukážkový profil odborníka." meta="Slovensko" actionLabel="Pozrieť profil" />;
    case "content-card":
      return <PublicContentListItem href="/clanky" eyebrow="Odborný článok" title="Starostlivosť o šteňa"
        excerpt="Praktický sprievodca prvými týždňami." meta="Psipedia" actionLabel="Čítať" />;
    case "article-list":
      return <PublicArticleListItem href="/clanky" title="Ako naučiť psa privolanie"
        topic="Výcvik" date="Ukážka" listItem={false} />;
    case "section-search":
      return <SectionHeroSearch action="/hladat" id="component-preview-section-search"
        label="Ukážkové vyhľadávanie" placeholder="Hľadať..." buttonLabel="Hľadať" />;
    case "home-search":
      return <HomePortalSearch id="component-preview-home-search" />;
    case "action-button":
      return <div style={{ display: "flex", flexWrap: "wrap", gap: 12, padding: 12 }}>
        <PublicActionButton>Primárne</PublicActionButton>
        <PublicActionButton variant="secondary">Sekundárne</PublicActionButton>
        <PublicActionButton variant="tertiary">Textové</PublicActionButton>
      </div>;
    case "landing-heading":
      return <PublicLandingSectionHeading eyebrow="Prehľad" title="Odporúčané články"
        description="Výber zaujímavých tém pre majiteľov psov." />;
    case "content-shell":
      return <PublicContentShell variant="landing">
        <p style={{ margin: 0, padding: 12 }}>Ukážkový obsah v spoločnom kontajneri.</p>
      </PublicContentShell>;
    case "empty-state":
      return <PublicEmptyState title="Nenašli sa žiadne výsledky"
        description="Skúste upraviť filtre alebo zmeniť hľadaný výraz." />;
    case "notice":
      return <PublicNotice tone="info" as="div">Toto je vzorové informačné upozornenie.</PublicNotice>;
    case "pagination":
      return <PublicPagination currentPage={2} totalPages={5} previousHref="/clanky" nextHref="/clanky" />;
    case "filter-tag":
      return <div style={{ padding: 16 }}><PublicFilterTag>Veterinári</PublicFilterTag></div>;
    case "loading":
      return <PublicLoadingState label="Načítavam výsledky..." />;
    case "fallback":
      return <PublicMediaFallback size="detail" />;
    case "actions":
      return <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, padding: "24px 14px" }}>
        <PublicActionLink href="/adresar" variant="primary">Primárna akcia</PublicActionLink>
        <PublicActionLink href="/plemena" variant="secondary">Sekundárna akcia</PublicActionLink>
        <PublicActionLink href="/clanky" variant="tertiary">Textový odkaz</PublicActionLink>
      </div>;
    case "controls":
      return <div style={{ display: "flex", flexWrap: "wrap", gap: 12, padding: "24px 14px" }}>
        <PublicTextInput aria-label="Ukážka vyhľadávania" placeholder="Hľadať služby alebo plemená" readOnly />
        <PublicSelect aria-label="Ukážka výberu" defaultValue="all">
          <option value="all">Všetky kategórie</option>
          <option value="veterinari">Veterinári</option>
        </PublicSelect>
      </div>;
  }
}
