import Link from "next/link";
import { ArticleCard } from "@/components/article-card";
import { PortalSectionTabs } from "@/components/portal-section-tabs";
import type { ArticleListingCard } from "@/lib/content";
import type { PortalSection } from "@/lib/portal";
import { PublicHelpCategoryNav } from "@/components/public-visual-system/public-help-category-nav";
import { PublicHelpProfileCard } from "@/components/public-visual-system/public-help-profile-card";
import { PublicMediaFallback } from "@/components/public-visual-system/public-media-fallback";
import { Breadcrumbs, SectionTabs } from "@/components/page-system";

/**
 * Real public components rendered with synthetic, clearly illustrative content.
 * This module is only imported by the admin visual catalogue: no D1 reads,
 * side effects, user data or changes to the production component implementation.
 * Parent catalogue/comparison keeps every interaction inert.
 */
export type AdminExtraPreviewId =
  | "help-profile"
  | "help-profile-urgent"
  | "help-category-nav"
  | "breadcrumbs"
  | "section-tabs"
  | "portal-section-tabs"
  | "article-card-grid"
  | "article-card-featured";

const sampleArticle: ArticleListingCard = {
  slug: "ukazkovy-clanok",
  title: "Ako pripraviť šteňa na prvé dni doma",
  excerpt: "Ilustračná ukážka redakčnej karty s fotografickým zástupným obsahom.",
  category: "Život so psom",
  date: "Ukážkový dátum",
  dateIso: "2026-11-03",
  accent: "forest",
  portalSection: "steniatka",
};

const sampleSection: PortalSection = {
  slug: "steniatka",
  label: "Šteniatka",
  icon: "🐾",
  accent: "forest",
  eyebrow: "Príručka",
  description: "Ukážka",
  intro: "Ilustračná navigácia sekcie",
  articleEnabled: true,
  subpages: [
    { slug: "prve-dni", label: "Prvé dni doma", description: "Základy starostlivosti" },
    { slug: "rast-a-vyvoj", label: "Rast a vývoj", description: "Od šteniatka po dospelého psa" },
    { slug: "vychova", label: "Výchova", description: "Základy výcviku" },
  ],
};

export function AdminExtraComponentPreview({ id }: { id: AdminExtraPreviewId }) {
  switch (id) {
    case "article-card-grid":
      return <div style={{maxWidth: 360, padding: 8}}>
        <ArticleCard article={sampleArticle} variant="grid" showFavorite={false} />
      </div>;
    case "article-card-featured":
      return <div style={{maxWidth: 560, padding: 8}}>
        <ArticleCard article={{...sampleArticle, title: "Ukážka odporúčaného článku"}}
          variant="featured" showFavorite={false} />
      </div>;
    case "portal-section-tabs":
      return <div style={{padding: 12}}>
        <PortalSectionTabs section={sampleSection} activeSlug="prve-dni" />
      </div>;
    case "help-profile":
    case "help-profile-urgent": {
      const urgent = id === "help-profile-urgent";
      return <div style={{maxWidth: 420, padding: 8}}>
        <PublicHelpProfileCard
          href="/pomoc-psom/adopcia"
          title={urgent ? "Ukážkový stratený pes" : "Ukážkový pes na adopciu"}
          category={urgent ? "Stratené psy" : "Adopcia"}
          meta="Nitra · Nitriansky kraj"
          excerpt="Ilustračný obsah na porovnanie spoločnej šablóny karty. Nejde o skutočný prípad."
          badge={urgent ? <span style={{borderRadius: 8, padding: "5px 8px", background: "#b44939", color: "white"}}>Urgentné</span> : null}
          media={<PublicMediaFallback appearance="context" size="detail" decorative />}
        />
      </div>;
    }
    case "help-category-nav":
      return <div style={{padding: 12}}>
        <PublicHelpCategoryNav items={[
          {slug: "adopcia", label: "Adopcia", href: "/pomoc-psom/adopcia", count: 58, current: true},
          {slug: "utulky", label: "Útulky", href: "/pomoc-psom/utulky", count: 12},
          {slug: "stratene-a-najdene", label: "Stratené a nájdené", href: "/pomoc-psom/stratene-a-najdene", count: 9},
        ]} />
      </div>;
    case "breadcrumbs":
      return <div style={{padding: 16}}>
        <Breadcrumbs label="Ukážka navigácie">
          <Link href="/">Domov</Link>
          <span>/</span>
          <Link href="/pomoc-psom">Pomoc psom</Link>
          <span>/</span>
          <span>Adopcia</span>
        </Breadcrumbs>
      </div>;
    case "section-tabs":
      return <div style={{padding: 12}}>
        <SectionTabs label="Ukážka záložiek profilu">
          <Link href="/plemena">Prehľad</Link>
          <Link href="/plemena">Povaha</Link>
          <Link href="/plemena">Zdravie</Link>
          <Link href="/plemena">Výcvik</Link>
        </SectionTabs>
      </div>;
  }
}
