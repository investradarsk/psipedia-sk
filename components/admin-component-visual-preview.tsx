import { ContentHubCta } from "./content-hub-cta";
import { AdminProfileComponentPreview } from "./admin-visual-library-profile-previews";
import { AdminDetailComponentPreview } from "./admin-visual-library-detail-previews";
import { AdminExtraComponentPreview } from "./admin-visual-library-extra-previews";
import { AdminMoreComponentPreview } from "./admin-visual-library-more-previews";
import { AdminUtilityComponentPreview } from "./admin-visual-library-utility-previews";
import { AdminAdditionalComponentPreview } from "./admin-visual-library-additional-previews";
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
  { id: "breed-card", path: "components/breed-card.tsx", family: "card", title: "Karta plemena – atlas", description: "Verejná karta plemena s FCI údajmi a hodnotením. Iba ukážkové údaje." },
  { id: "directory-card", path: "components/directory-card.tsx", family: "card", title: "Karta veterinárnej služby", description: "Skutočná karta adresára s ukážkovou prevádzkou a službami." },
  { id: "event-list", path: "components/event-card.tsx", family: "card", title: "Podujatie – zoznam", description: "Riadkový variant verejného podujatia s ukážkovým dátumom a miestom." },
  { id: "event-grid", path: "components/event-card.tsx", family: "card", title: "Podujatie – mriežka", description: "Kartový variant verejného podujatia s tým istým ukážkovým obsahom." },
  { id: "help-card", path: "components/help-card.tsx", family: "card", title: "Pomoc psom – aktívny prípad", description: "Verejná karta pomoci s ilustračným priebehom zbierky." },
  { id: "help-resolved", path: "components/help-card.tsx", family: "card", title: "Pomoc psom – ukončený prípad", description: "Rovnaký komponent s označením vyriešeného prípadu." },
  { id: "related-breed-list", path: "components/related-entity-list.tsx", family: "card", title: "Súvisiace plemená", description: "Skutočné karty súvisiacich plemien s náhradnými obrázkami." },
  { id: "directory-category-navigation", path: "components/directory-category-navigation.tsx", family: "category", title: "Navigácia kategórií služieb", description: "Skutočný prepínač kategórií adresára s ukážkovým výberom." },
  { id: "site-footer", path: "components/site-footer.tsx", family: "other", title: "Pätička a právne odkazy", description: "Skutočná spoločná pätička webu s odkazmi a nastaveniami cookies." },
  { id: "directory-services-short", path: "components/directory-services-list.tsx", family: "other", title: "Detail služby – poskytované služby", description: "Skutočný dvojstĺpcový zoznam služieb v profile s fiktívnym obsahom." },
  { id: "directory-services-expanded", path: "components/directory-services-list.tsx", family: "other", title: "Detail služby – dlhý zoznam", description: "Skutočný zoznam nad limitom 10 položiek s tlačidlom na rozbalenie; v náhľade neaktívnym." },
  { id: "breed-section-nav", path: "components/breed-section-nav.tsx", family: "category", title: "Detail plemena – navigácia sekcií", description: "Reálne sekciové záložky plemena s ilustračnými názvami." },
  { id: "help-urgent", path: "components/help-card.tsx", family: "card", title: "Pomoc psom – urgentný prípad", description: "Skutočná karta so zvýraznením urgentnej pomoci, bez skutočnej výzvy." },
  { id: "event-cancelled", path: "components/event-card.tsx", family: "card", title: "Podujatia – zrušený termín", description: "Skutočná mriežková karta zrušeného ilustračného podujatia." },
  { id: "event-listing-filtered", path: "components/event-listing-results.tsx", family: "filter", title: "Podujatia – formulár filtrov a výsledky", description: "Celé skutočné rozloženie filtrov a výsledkov podujatí s fiktívnou kartou." },
  { id: "event-listing-empty", path: "components/event-listing-results.tsx", family: "filter", title: "Podujatia – filtre bez výsledkov", description: "Skutočná prázdna výsledková sekcia po použití filtrov." },
  { id: "help-profile", path: "components/public-visual-system/public-help-profile-card.tsx", family: "card", title: "Pomoc psom – karta profilu", description: "Spoločná karta profilov Pomoc psom s fiktívnymi údajmi. Rovnaký komponent v prehľadoch a kategóriách." },
  { id: "help-profile-urgent", path: "components/public-visual-system/public-help-profile-card.tsx", family: "card", title: "Pomoc psom – urgentné označenie", description: "Rovnaká karta profilu s vloženým urgentným štítkom. Nejde o samostatnú implementáciu." },
  { id: "help-category-nav", path: "components/public-visual-system/public-help-category-nav.tsx", family: "category", title: "Pomoc psom – navigácia kategórií", description: "Skutočné navigačné karty pre adopcie, útulky a stratené psy s ilustračnými počtami." },
  { id: "portal-section-tabs", path: "components/portal-section-tabs.tsx", family: "category", title: "Sekciová navigácia Šteniatka", description: "Skutočný prepínač podkategórií v sekcii s ilustračnými odkazmi, postavený na spoločnom navigátore." },
  { id: "article-card-grid", path: "components/article-card.tsx", family: "card", title: "Článok – štandardná karta", description: "Skutočný verejný ArticleCard vo výpise článkov, iba vzorový obsah." },
  { id: "article-card-featured", path: "components/article-card.tsx", family: "card", title: "Článok – zvýraznená karta", description: "Rovnaký ArticleCard vo variante featured s vlastným demo obsahom." },
  { id: "breed-fci-disclosure", path: "components/breed-fci-disclosure.tsx", family: "other", title: "Plemeno – rozbalenie FCI štandardu", description: "Skutočný interaktívny ovládač z detailu plemena." },
  { id: "breed-photo-fallback", path: "components/breed-photo.tsx", family: "card", title: "Plemeno – náhradná fotografia", description: "Skutočný BreedPhoto pri nezadanej fotografii." },
  { id: "directory-opening-hours", path: "components/directory-opening-hours.tsx", family: "other", title: "Služba – otváracie hodiny", description: "Spoločná prezentácia hodín na detailoch služieb." },
  { id: "dog-age-calculator", path: "components/dog-age-calculator.tsx", family: "other", title: "Kalkulačka veku psa", description: "Reálny interaktívny prepočet veku bez zápisu dát." },
  { id: "event-image-fallback", path: "components/event-image.tsx", family: "card", title: "Podujatie – náhradný obrázok", description: "Skutočný obrázkový komponent pri chýbajúcej fotke." },
  { id: "events-back-link", path: "components/events-return-link.tsx", family: "cta", title: "Podujatie – späť na výsledky", description: "Skutočný spätný odkaz bez aktivácie histórie v ukážke." },
  { id: "help-report-guide", path: "components/help-report-guide.tsx", family: "other", title: "Pomoc psom – návod na nahlásenie", description: "Reálna návodová stránka, výrez celej sekcie." },
  { id: "horizontal-carousel-controls", path: "components/horizontal-carousel-controls.tsx", family: "cta", title: "Carousel – ovládacie šípky", description: "Skutočné ovládacie šípky horizontálneho zoznamu." },
  { id: "public-filter-disclosure", path: "components/public-filter-disclosure.tsx", family: "filter", title: "Rozbaľovacie filtre", description: "Skutočný ovládač filtrov s dvomi aktívnymi položkami." },
  { id: "public-profile-hero", path: "components/public-profile/public-profile-hero.tsx", family: "hero", title: "Profil – spoločná hlavička", description: "Skutočná hlavička profilu s ukážkovými údajmi." },
  { id: "related-entity-links", path: "components/related-entity-links.tsx", family: "category", title: "Súvisiace odkazy", description: "Skutočný komponent pre interné prepojenia obsahu." },

  { id: "article-continuation", path: "components/article-continuation.tsx", family: "cta", title: "Článok – pokračovanie v téme", description: "Skutočný CTA navigačný blok za článkom." },
  { id: "event-markdown", path: "components/event-markdown.tsx", family: "other", title: "Podujatie – formátovaný opis", description: "Skutočné zobrazenie programu a Markdown textu." },
  { id: "help-public-icons", path: "components/help-public-icons.tsx", family: "other", title: "Pomoc psom – ikony", description: "Originálne ikony pre kategórie pomoci." },
  { id: "portal-mobile-category-select", path: "components/portal-mobile-category-select.tsx", family: "category", title: "Sekcia – mobilný výber témy", description: "Skutočný selektor kategórie. Náhľad bez navigačnej akcie." },
  { id: "public-help-card-surface", path: "components/public-visual-system/public-help-card-surface.tsx", family: "card", title: "Pomoc psom – základ karty", description: "Reálne základné vizuálne rozloženie pre spoločné karty." },
  { id: "public-photo-gallery", path: "components/public-visual-system/public-photo-gallery.tsx", family: "card", title: "Galéria fotografií", description: "Skutočná verejná galéria v redakčnom variante." },
  { id: "share-button", path: "components/share-button.tsx", family: "cta", title: "Zdieľanie článku", description: "Reálne tlačidlo zdieľania bez spustenia akcií." },
  { id: "smart-card-image", path: "components/smart-card-image.tsx", family: "card", title: "Inteligentný obrázok karty", description: "Skutočný smart image prvok s ilustračnou fotografiou." },
  { id: "slovakia-location-selector", path: "components/slovakia-location-selector.tsx", family: "filter", title: "Výber lokality Slovenska", description: "Originálny regionálny formulárový ovládač." },

  { id: "adoption-card-media", path: "components/adoption-card-media.tsx", family: "card", title: "Adopcia – fotografia a stav", description: "Originálny obrázkový blok adopčnej karty so stavom." },
  { id: "article-promo", path: "components/article-promo.tsx", family: "banner", title: "Článok – automatický promo banner", description: "Skutočný redakčný promo obal, používa spoločný PublicMagazineBanner." },
  { id: "image-display", path: "components/image-display.tsx", family: "card", title: "Zobrazenie obrázka", description: "Verejné nastavenie orezania a náhľadu obrázka." },
  { id: "icons", path: "components/icons.tsx", family: "other", title: "Spoločné ikony", description: "Skutočné SVG ikony navigácie a akcií." },
  { id: "partner-password-field", path: "components/partner-password-field.tsx", family: "filter", title: "Partner – pole hesla", description: "Reálny ovládač bez účtu, údajov ani odoslania." },
  { id: "breadcrumbs", path: "components/page-system.tsx", family: "category", title: "Drobečková navigácia", description: "Spoločná navigácia používaná v detailoch a sekciách, ilustračné odkazy." },
  { id: "section-tabs", path: "components/page-system.tsx", family: "category", title: "Záložky sekcie", description: "Skutočný kontajner pre sekciové záložky s ukážkovými odkazmi." },
] as const;

export type AdminComponentPreviewId = (typeof adminComponentPreviewSamples)[number]["id"];

export function AdminComponentVisualPreview({ id }: { id: AdminComponentPreviewId }) {
  switch (id) {
    case "adoption-card-media":
    case "article-promo":
    case "image-display":
    case "icons":
    case "partner-password-field":
      return <AdminAdditionalComponentPreview id={id} />;
    case "article-continuation":
    case "event-markdown":
    case "help-public-icons":
    case "portal-mobile-category-select":
    case "public-help-card-surface":
    case "public-photo-gallery":
    case "share-button":
    case "smart-card-image":
    case "slovakia-location-selector":
      return <AdminUtilityComponentPreview id={id} />;
    case "breed-fci-disclosure":
    case "breed-photo-fallback":
    case "directory-opening-hours":
    case "dog-age-calculator":
    case "event-image-fallback":
    case "events-back-link":
    case "help-report-guide":
    case "horizontal-carousel-controls":
    case "public-filter-disclosure":
    case "public-profile-hero":
    case "related-entity-links":
      return <AdminMoreComponentPreview id={id} />;
    case "help-profile":
    case "help-profile-urgent":
    case "help-category-nav":
    case "breadcrumbs":
    case "section-tabs":
    case "portal-section-tabs":
    case "article-card-grid":
    case "article-card-featured":
      return <AdminExtraComponentPreview id={id} />;
    case "breed-card":
      return <AdminProfileComponentPreview id="breed-card" />;
    case "directory-card":
      return <AdminProfileComponentPreview id="directory-card" />;
    case "event-list":
      return <AdminProfileComponentPreview id="event-list" />;
    case "event-grid":
      return <AdminProfileComponentPreview id="event-grid" />;
    case "help-card":
      return <AdminProfileComponentPreview id="help-card" />;
    case "help-resolved":
      return <AdminProfileComponentPreview id="help-resolved" />;
    case "related-breed-list":
      return <AdminProfileComponentPreview id="related-breed-list" />;
    case "directory-category-navigation":
      return <AdminProfileComponentPreview id="directory-category-navigation" />;
    case "site-footer":
      return <AdminProfileComponentPreview id="site-footer" />;
    case "directory-services-short":
      return <AdminDetailComponentPreview id="directory-services-short" />;
    case "directory-services-expanded":
      return <AdminDetailComponentPreview id="directory-services-expanded" />;
    case "breed-section-nav":
      return <AdminProfileComponentPreview id="breed-section-nav" />;
    case "help-urgent":
      return <AdminProfileComponentPreview id="help-urgent" />;
    case "event-cancelled":
      return <AdminProfileComponentPreview id="event-cancelled" />;
    case "event-listing-filtered":
      return <AdminDetailComponentPreview id="event-listing-filtered" />;
    case "event-listing-empty":
      return <AdminDetailComponentPreview id="event-listing-empty" />;
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
