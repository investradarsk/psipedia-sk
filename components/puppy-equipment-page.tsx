import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { Breadcrumbs, PageContainer } from "@/components/page-system";
import { UniversalPageHero } from "@/components/public-visual-system/universal-page-hero";
import { PortalSectionTabs } from "@/components/portal-section-tabs";
import { PublicFoundation } from "@/components/public-visual-system";
import { PuppyEquipmentChecklist } from "@/components/puppy-equipment-checklist";
import { AFFILIATE_BANNER_PARTNERS } from "@/lib/affiliate-banner-rotation";
import type { PortalSection, PortalSubpage } from "@/lib/portal";
import styles from "./puppy-equipment.module.css";

export function PuppyEquipmentLink({ section }: { section: PortalSection }) {
  if (!section.subpages.some(item => item.slug === "vybava" && item.visible !== false)) return null;
  return <Link href="/steniatka/vybava" className={styles.toolLink}>
    <ClipboardCheck aria-hidden="true" size={26} />
    <span><strong>Výbava pre šteniatko</strong><small>Odškrtni, čo už máš pripravené, a zisti, čo ti ešte chýba.</small></span>
    <span aria-hidden="true">→</span>
  </Link>;
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
          <div className={styles.partnerLinks}>{AFFILIATE_BANNER_PARTNERS.map(partner => <a key={partner.id} href={partner.href} target="_blank" rel="sponsored noopener noreferrer">{partner.name} ↗</a>)}</div>
          <p className={styles.note}>Stránka obsahuje partnerské odkazy.</p>
        </section>
        <section className={styles.related} aria-label="Súvisiace témy">
          <h2>Ďalšie prípravy</h2>
          <div><Link href="/steniatka/pred-kupou-psa">Pred kúpou psa</Link><Link href="/steniatka/prve-dni">Prvé dni doma</Link><Link href="/steniatka/krmenie">Kŕmenie</Link><Link href="/adresar/veterinari">Nájsť veterinára</Link></div>
        </section>
      </PageContainer>
    </main>
  </PublicFoundation>;
}
