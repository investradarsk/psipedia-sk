import Link from "next/link";
import { Calculator } from "lucide-react";
import { Breadcrumbs, PageContainer } from "@/components/page-system";
import { UniversalPageHero } from "@/components/public-visual-system/universal-page-hero";
import { PortalSectionTabs } from "@/components/portal-section-tabs";
import { PublicFoundation } from "@/components/public-visual-system";
import { DogCalculators } from "@/components/dog-calculators";
import { AFFILIATE_BANNER_PARTNERS } from "@/lib/affiliate-banner-rotation";
import type { PortalSection, PortalSubpage } from "@/lib/portal";
import styles from "./dog-calculators.module.css";

export function DogCalculatorsLink({section}:{section:PortalSection}){
 if(!section.subpages.some(s=>s.slug==="kalkulacky"&&s.visible!==false))return null;
 return <Link className={styles.toolLink} href="/starostlivost/kalkulacky"><Calculator size={26} aria-hidden="true"/><span><strong>Psie kalkulačky</strong><small>Vypočítaj dávku, spotrebu, náklady na krmivo a ročný rozpočet.</small></span><span aria-hidden="true">→</span></Link>;
}
export function DogCalculatorsPage({section,subpage}:{section:PortalSection;subpage:PortalSubpage}){
 return <PublicFoundation><main id="obsah" className={styles.page}>
 <UniversalPageHero title={subpage.label} intro={subpage.description} eyebrow="Praktické nástroje · Zdravie a starostlivosť" imageUrl="/images/zdravie-veterinar.webp" showSearch={false} breadcrumbs={<Breadcrumbs><Link href="/">Domov</Link><span>/</span><Link href="/starostlivost">Zdravie a starostlivosť</Link><span>/</span><span>Psie kalkulačky</span></Breadcrumbs>}/>
 <PortalSectionTabs section={section} activeSlug="kalkulacky"/>
 <PageContainer className={styles.container}>
 <nav className={styles.links} aria-label="Výber kalkulačky">{[["energia","Energia a dávka"],["spotreba","Spotreba a cena"],["porovnanie","Porovnanie krmív"],["rozpocet","Ročný rozpočet"],["vek","Vek psa"]].map(([id,label])=><a key={id} href={"#"+id}>{label}</a>)}</nav>
 <p className={styles.intro}>Výpočty fungujú bez registrácie a zadávané údaje nástroj neposiela na server. Uprav vstupné hodnoty podľa svojho psa a krmiva.</p>
 <DogCalculators/>
 <section className={styles.panel}><h2>Kde hľadať krmivo a výbavu</h2><p>Porovnaj vhodnosť krmiva a skutočné náklady, nie iba cenu balenia.</p><div className={styles.links}>{AFFILIATE_BANNER_PARTNERS.map(partner=><a key={partner.id} href={partner.href} target="_blank" rel="sponsored noopener noreferrer">{partner.name} ↗</a>)}</div><p className={styles.note}>Stránka obsahuje partnerské odkazy.</p></section>
 <section className={styles.panel}><h2>Súvisiace témy</h2><div className={styles.links}><Link href="/starostlivost/vyziva">Výživa psa</Link><Link href="/steniatka/krmenie">Kŕmenie šteniatka</Link><Link href="/adresar/veterinari">Nájsť veterinára</Link></div></section>
 </PageContainer></main></PublicFoundation>;
}
