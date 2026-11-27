import Link from "next/link";
import { CalendarHeart } from "lucide-react";
import { Breadcrumbs, PageContainer } from "@/components/page-system";
import { UniversalPageHero } from "@/components/public-visual-system/universal-page-hero";
import { PortalSectionTabs } from "@/components/portal-section-tabs";
import { PublicFoundation, PublicDataCard, PublicActionLink } from "@/components/public-visual-system";
import { DogHealthCalendar } from "@/components/dog-health-calendar";
import type { PortalSection, PortalSubpage } from "@/lib/portal";
import styles from "./dog-health-calendar.module.css";

export function DogHealthCalendarLink({section}:{section:PortalSection}){
  if(!section.subpages.some(s=>s.slug==="zdravotny-kalendar"&&s.visible!==false))return null;
  return <PublicDataCard className={styles.toolLink} href="/starostlivost/zdravotny-kalendar" title="Zdravotný kalendár psa" description="Eviduj očkovanie, odčervenie a návštevy veterinára na jednom mieste." icon={<CalendarHeart />} actionLabel="Otvoriť nástroj" />;
}
export function DogHealthCalendarPage({section,subpage}:{section:PortalSection;subpage:PortalSubpage}){
  return <PublicFoundation><main id="obsah" className={styles.page}>
    <UniversalPageHero title={subpage.label} intro={subpage.description} eyebrow="Praktický nástroj · Zdravie" imageUrl="/images/zdravie-veterinar.webp" showSearch={false} breadcrumbs={<Breadcrumbs><Link href="/">Domov</Link><span>/</span><Link href="/starostlivost">Zdravie a starostlivosť</Link><span>/</span><span>Zdravotný kalendár</span></Breadcrumbs>}/>
    <PortalSectionTabs section={section} activeSlug="zdravotny-kalendar"/>
    <PageContainer className={styles.container}>
      <p className={styles.intro}>Naplánuj a zaznamenaj starostlivosť o jedného alebo viac psov. Termíny zadávaš podľa odporúčania svojho veterinára a pokynov konkrétneho prípravku. Nástroj neurčuje dávky ani intervaly očkovania či odčervenia a nenahrádza veterinárne vyšetrenie.</p>
      <DogHealthCalendar/>
      <div className={styles.panel}><h2>Užitočné odkazy</h2><div className={styles.actions}><PublicActionLink variant="secondary" href="/adresar/veterinari">Nájsť veterinára</PublicActionLink><PublicActionLink variant="secondary" href="/starostlivost/zdravie">Zdravie psa</PublicActionLink><PublicActionLink variant="secondary" href="/steniatka/ockovanie-a-zdravie">Očkovanie a zdravie šteniatka</PublicActionLink></div></div>
    </PageContainer>
  </main></PublicFoundation>;
}
