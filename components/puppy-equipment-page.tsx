import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { Breadcrumbs, PageContainer } from "@/components/page-system";
import { UniversalPageHero } from "@/components/public-visual-system/universal-page-hero";
import { PortalSectionTabs } from "@/components/portal-section-tabs";
import { PublicFoundation, PublicDataCard, PublicActionLink } from "@/components/public-visual-system";
import { PuppyEquipmentChecklist } from "@/components/puppy-equipment-checklist";
import { AFFILIATE_BANNER_PARTNERS } from "@/lib/affiliate-banner-rotation";
import type { PortalSection, PortalSubpage } from "@/lib/portal";
import styles from "./puppy-equipment.module.css";

export function PuppyEquipmentLink({ section }: { section: PortalSection }) {
  if (!section.subpages.some(item => item.slug === "vybava" && item.visible !== false)) return null;
  return <PublicDataCard className={styles.toolLink} href="/steniatka/vybava" title="Výbava pre šteniatko" description="Odškrtni, čo už máš pripravené, a zisti, čo ti ešte chýba." icon={<ClipboardCheck />} actionLabel="Otvoriť nástroj" />;
}

export function PuppyEquipmentPage({ section, subpage }: { section: PortalSection; subpage: PortalSubpage }) {
  return <PublicFoundation>
    <main id="obsah" className={styles.page}>
      <UniversalPageHero title={subpage.label} intro={subpage.description} eyebrow="Praktický nástroj · Šteniatka"
        breadcrumbs={<Breadcrumbs><Link href="/">Domov</Link><span>/</span><Link href="/steniatka">Šteniatka</Link><span>/</span><span>Výbava</span></Breadcrumbs>} showSearch={false} />
      <PortalSectionTabs section={section} activeSlug="vybava" />
      <PageContainer className={styles.container}>
        <p className={styles.intro}>Pred príchodom šteniatka nemusíš kúpiť všetko naraz. Zaškrtni veci, ktoré už máš, a prípravy, ktoré si vybavil. Voliteľné položky sa do základnej pripravenosti nepočítajú.</p>
        <PuppyEquipmentChecklist />
        <section className={styles.partners} aria-labelledby="equipment-partners">
          <h2 id="equipment-partners">Kde hľadať výbavu</h2>
          <p>Ak niečo chýba, výbavu môžeš vyhľadať v partnerských e-shopoch. Porovnaj veľkosť, vhodnosť, cenu a podmienky vrátenia.</p>
          <div className={styles.partnerLinks}>{AFFILIATE_BANNER_PARTNERS.map(partner => <PublicActionLink key={partner.id} variant="secondary" href={partner.href} target="_blank" rel="sponsored noopener noreferrer">{partner.name}</PublicActionLink>)}</div>
          <p className={styles.note}>Stránka obsahuje partnerské odkazy.</p>
        </section>
        <section className={styles.related} aria-label="Súvisiace témy">
          <h2>Ďalšie prípravy</h2>
          <div><PublicActionLink variant="secondary" href="/steniatka/pred-kupou-psa">Pred kúpou psa</PublicActionLink><PublicActionLink variant="secondary" href="/steniatka/prve-dni">Prvé dni doma</PublicActionLink><PublicActionLink variant="secondary" href="/steniatka/krmenie">Kŕmenie</PublicActionLink><PublicActionLink variant="secondary" href="/adresar/veterinari">Nájsť veterinára</PublicActionLink></div>
        </section>
      </PageContainer>
    </main>
  </PublicFoundation>;
}
