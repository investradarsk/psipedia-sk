import Link from "next/link";
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
  | "section-tabs";

export function AdminExtraComponentPreview({ id }: { id: AdminExtraPreviewId }) {
  switch (id) {
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
