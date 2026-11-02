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
