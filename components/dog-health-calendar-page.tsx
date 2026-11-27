import Link from "next/link";
import { CalendarHeart } from "lucide-react";
import { Breadcrumbs, PageContainer } from "@/components/page-system";
import { UniversalPageHero } from "@/components/public-visual-system/universal-page-hero";
import { PortalSectionTabs } from "@/components/portal-section-tabs";
import { PublicFoundation } from "@/components/public-visual-system";
import { DogHealthCalendar } from "@/components/dog-health-calendar";
import type { PortalSection, PortalSubpage } from "@/lib/portal";
import styles from "./dog-health-calendar.module.css";

export function DogHealthCalendarLink({section}:{section:PortalSection}){
  if(!section.subpages.some(s=>s.slug==="zdravotny-kalendar"&&s.visible!==false))return null;
  return <Link className={styles.toolLink} href="/starostlivost/zdravotny-kalendar"><CalendarHeart size={26} aria-hidden="true"/><span><strong>Zdravotný kalendár psa</strong><small>Eviduj očkovanie, odčervenie a návštevy veterinára na jednom mieste.</small></span><span aria-hidden="true">→</span></Link>;
}
export function DogHealthCalendarPage({section,subpage}:{section:PortalSection;subpage:PortalSubpage}){
  return <PublicFoundation><main id="obsah" className={styles.page}>
    <UniversalPageHero title={subpage.label} intro={subpage.description} eyebrow="Praktický nástroj · Zdravie" imageUrl="/images/zdravie-veterinar.webp" showSearch={false} breadcrumbs={<Breadcrumbs><Link href="/">Domov</Link><span>/</span><Link href="/starostlivost">Zdravie a starostlivosť</Link><span>/</span><span>Zdravotný kalendár</span></Breadcrumbs>}/>
    <PortalSectionTabs section={section} activeSlug="zdravotny-kalendar"/>
    <PageContainer className={styles.container}>
      <p className={styles.intro}>Naplánuj a zaznamenaj starostlivosť o jedného alebo viac psov. Termíny zadávaš podľa odporúčania svojho veterinára a pokynov konkrétneho prípravku. Nástroj neurčuje dávky ani intervaly očkovania či odčervenia a nenahrádza veterinárne vyšetrenie.</p>
      <DogHealthCalendar/>
      <div className={styles.panel}><h2>Užitočné odkazy</h2><div className={styles.actions}><Link href="/adresar/veterinari">Nájsť veterinára</Link><Link href="/starostlivost/zdravie">Zdravie psa</Link><Link href="/steniatka/ockovanie-a-zdravie">Očkovanie a zdravie šteniatka</Link></div></div>
    </PageContainer>
  </main></PublicFoundation>;
}
