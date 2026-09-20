import {
  getPortalSection,
  getPortalSubpage,
  type ArticlePortalSection,
} from "@/lib/portal";
import { isNewsCategory, type NewsCategorySlug } from "@/lib/news";

export type CanonicalArticleCategory = "Zdravie" | "Výživa" | "Výcvik" | "Život so psom";

export const NOTION_CANONICAL_SECTION_PORTALS = {
  "Zdravie a starostlivosť": "starostlivost",
  "Výcvik a aktivity": "aktivity",
  "Šteniatka": "steniatka",
  "Novinky zo sveta psov": "novinky",
  "Recenzie a testy": "recenzie",
} as const satisfies Record<string, ArticlePortalSection>;

export type NotionCanonicalSection = keyof typeof NOTION_CANONICAL_SECTION_PORTALS;

export type CanonicalArticleSubsection = {
  section: NotionCanonicalSection;
  subsection: string;
  portalSection: ArticlePortalSection;
  portalSubpage: string;
  publicSubsectionPath: string;
  category: CanonicalArticleCategory;
  newsCategory: NewsCategorySlug | null;
};

function articleCategoryForSubsection(portalSection: ArticlePortalSection, portalSubpage: string): CanonicalArticleCategory {
  if (portalSection === "starostlivost") {
    if (portalSubpage === "zdravie" || portalSubpage === "srst-a-hygiena" || portalSubpage === "senior") return "Zdravie";
    if (portalSubpage === "vyziva") return "Výživa";
    if (portalSubpage === "vycvik") return "Výcvik";
    return "Život so psom";
  }
  if (portalSection === "aktivity") return "Výcvik";
  if (portalSection === "recenzie" && portalSubpage === "krmiva") return "Výživa";
  return "Život so psom";
}

function isCanonicalArticleSubpage(portalSection: ArticlePortalSection, slug: string) {
  const match = getPortalSubpage(portalSection, slug);
  if (!match || match.subpage.href) return false;
  if (portalSection === "novinky" && !isNewsCategory(slug)) return false;
  return true;
}

export function canonicalArticleSubsectionOptions() {
  return Object.entries(NOTION_CANONICAL_SECTION_PORTALS).flatMap(([sectionLabel, portalSection]) => {
    const section = getPortalSection(portalSection);
    if (!section?.articleEnabled) return [];
    return section.subpages
      .filter((subpage) => isCanonicalArticleSubpage(portalSection, subpage.slug))
      .map((subpage) => ({
        section: sectionLabel as NotionCanonicalSection,
        subsection: subpage.label,
        portalSection,
        portalSubpage: subpage.slug,
        publicSubsectionPath: `/${portalSection}/${subpage.slug}`,
      }));
  });
}

export function resolveCanonicalArticleSubsection(
  sectionLabel: string,
  subsectionLabel: string,
): CanonicalArticleSubsection {
  const portalSection = NOTION_CANONICAL_SECTION_PORTALS[sectionLabel as NotionCanonicalSection];
  if (!portalSection) {
    throw new Error(`Sekcia „${sectionLabel}“ nepodporuje canonical Podsekciu. Skontroluj Kategóriu v Notione.`);
  }

  const section = getPortalSection(portalSection);
  if (!section?.articleEnabled) {
    throw new Error(`Sekcia „${sectionLabel}“ nie je podporovaná pre články.`);
  }

  const subpage = section.subpages.find((item) => item.label === subsectionLabel);
  if (!subpage || !isCanonicalArticleSubpage(portalSection, subpage.slug)) {
    throw new Error(`Podsekcia „${subsectionLabel}“ nepatrí do sekcie „${sectionLabel}“.`);
  }

  const newsCategory = portalSection === "novinky" && isNewsCategory(subpage.slug)
    ? subpage.slug
    : null;

  return {
    section: sectionLabel as NotionCanonicalSection,
    subsection: subsectionLabel,
    portalSection,
    portalSubpage: subpage.slug,
    publicSubsectionPath: `/${portalSection}/${subpage.slug}`,
    category: articleCategoryForSubsection(portalSection, subpage.slug),
    newsCategory,
  };
}

export function isCompatibleLegacyArticleSubsection(
  sectionLabel: string,
  portalSection: string,
  portalSubpage?: string | null,
) {
  const expectedSection = NOTION_CANONICAL_SECTION_PORTALS[sectionLabel as NotionCanonicalSection];
  if (!expectedSection || expectedSection !== portalSection || !portalSubpage) return false;
  return isCanonicalArticleSubpage(expectedSection, portalSubpage);
}
