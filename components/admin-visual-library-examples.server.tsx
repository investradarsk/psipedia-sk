import type { ReactNode } from "react";
import { UnifiedSectionHero, UnifiedSectionHeroShell } from "@/components/public-visual-system/unified-section-hero";
import { PublicActionLink } from "@/components/public-visual-system";
import { HomePortalSearch } from "@/components/home-portal-search";
import { ArticleListItem } from "@/components/article-list-item";
import { getSectionHeroVisual } from "@/lib/section-visual-store";
import { getPublishedArticleSummaries } from "@/lib/article-store";
import type { VisualLibraryExample } from "@/lib/visual-library-example-types";
import {
  HERO_BREEDS_ANCHOR,
  HERO_ARTICLES_ANCHOR,
  CTA_DIRECTORY_MAP_ANCHOR,
  CTA_HELP_ORGANIZATIONS_ANCHOR,
  articleListCardAnchor,
} from "@/lib/visual-library-anchors";

const path = (route: string) => "https://psipedia.sk" + route;

/** Real server-rendered public components, not hand-drawn screenshots. */
export async function getVisualLibraryExamples(): Promise<VisualLibraryExample[]> {
  const [breed, news, published] = await Promise.allSettled([
    getSectionHeroVisual("section.plemena"),
    getSectionHeroVisual("section.novinky"),
    getPublishedArticleSummaries({ limit: 1 }),
  ]);
  const examples: VisualLibraryExample[] = [];

  if (breed.status === "fulfilled") {
    const markup = await UnifiedSectionHero({
      eyebrow: "Atlas plemien",
      title: "Plemená",
      intro: "Nájdi plemeno podľa názvu, pôvodu, FCI skupiny alebo sekcie.",
      visual: breed.value,
      portalSearchSlot: (
        <HomePortalSearch
          action="/plemena"
          id="visual-library-breed-search"
          label="Hľadať plemeno"
          panelLabel="Vyhľadávanie plemien"
          eyebrow="AKÉ PLEMENO HĽADÁŠ?"
          title="Objav plemená podľa svojich potrieb"
          placeholder="Hľadať plemeno, krajinu alebo FCI skupinu"
          buttonLabel="Hľadať"
          allowEmpty shortcuts={[]} searchScope="breeds"
        />
      ),
    });
    examples.push({
      id: "hero:plemena",
      category: "hero",
      label: "Hero – Atlas plemien",
      explanation: "Živý hero komponent s fotografiou a nastavením z administrácie. V náhľade nie sú aktívne odkazy.",
      uses: [{
        url: path("/plemena"),
        label: "Atlas plemien",
        placement: "Hlavná hlavička stránky",
        anchorId: HERO_BREEDS_ANCHOR,
      }],
      preview: <UnifiedSectionHeroShell>{markup}</UnifiedSectionHeroShell>,
    });
  }

  if (news.status === "fulfilled") {
    const markup = await UnifiedSectionHero({
      eyebrow: "Psipedia",
      title: "Novinky zo sveta psov",
      intro: "Články, novinky, praktické návody a ďalší obsah, ktorý pomáha lepšie sa orientovať vo svete psov.",
      visual: news.value,
      portalSearchSlot: (
        <HomePortalSearch
          action="/clanky"
          id="visual-library-article-search"
          inputName="hladat"
          label="Hľadať v magazíne"
          panelLabel="Vyhľadávanie článkov"
          eyebrow="ČO HĽADÁŠ?"
          title="Nájdi článok alebo radu"
          placeholder="Hľadať v magazíne"
          buttonLabel="Hľadať"
          allowEmpty shortcuts={[]} searchScope="articles"
        />
      ),
    });
    examples.push({
      id: "hero:clanky",
      category: "hero",
      label: "Hero – Novinky",
      explanation: "Živý hero komponent a uložený vizuál hlavnej stránky článkov.",
      uses: [{
        url: path("/clanky"),
        label: "Novinky",
        placement: "Hlavná hlavička stránky",
        anchorId: HERO_ARTICLES_ANCHOR,
      }],
      preview: <UnifiedSectionHeroShell>{markup}</UnifiedSectionHeroShell>,
    });
  }

  examples.push({
    id: "cta:directory-map",
    category: "cta",
    label: "Tlačidlo – Zobraziť na mape",
    explanation: "Primárne CTA z bočného panela adresára. Cieľ odkazu na stránke závisí od aktívnych filtrov.",
    uses: [{
      url: path("/adresar"),
      label: "Služby pre psov",
      placement: "Bočný panel – karta Služby v okolí",
      anchorId: CTA_DIRECTORY_MAP_ANCHOR,
      note: "Rovnaká šablóna sa používa aj pri kategóriách adresára; ich URL budeme dopĺňať po individuálnom overení.",
    }],
    preview: <PublicActionLink href="/mapa" variant="primary">Zobraziť na mape →</PublicActionLink>,
  });

  examples.push({
    id: "cta:help-organizations",
    category: "cta",
    label: "Tlačidlo – Zobraziť organizácie",
    explanation: "Sekundárne CTA z hlavičky Pomoc psom. Používa skutočný komponent verejného tlačidla.",
    uses: [{
      url: path("/pomoc-psom"),
      label: "Pomoc psom",
      placement: "Hero – tlačidlo Zobraziť organizácie",
      anchorId: CTA_HELP_ORGANIZATIONS_ANCHOR,
    }],
    preview: <PublicActionLink href="/organizacie" variant="secondary">Zobraziť organizácie</PublicActionLink>,
  });

  const newestArticle = published.status === "fulfilled" ? published.value[0] : null;
  if (newestArticle) {
    examples.push({
      id: "card:article-list",
      category: "karty",
      label: "Karta – článok v Novinkách",
      explanation: "Skutočná karta s údajmi najnovšieho publikovaného článku. Zoznam je dynamický a poradie kariet sa môže meniť.",
      uses: [{
        url: path("/clanky"),
        label: "Novinky – zoznam článkov",
        placement: "Karta článku: " + newestArticle.title,
        anchorId: articleListCardAnchor(newestArticle.slug),
      }],
      preview: <ArticleListItem article={newestArticle} anchorId={undefined} />,
    });
  }

  return examples;
}
