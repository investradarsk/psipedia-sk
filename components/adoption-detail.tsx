import Link from "next/link";
import styles from "@/components/adoption.module.css";
import {
  adoptionActivityLabels, adoptionBooleanLabel, adoptionBreedHref, adoptionCompatibilityLabels, adoptionHref,
  adoptionIsStale, adoptionOrganizationHref, adoptionSexLabels, adoptionSizeLabels, adoptionStatusLabels,
  adoptionVaccinationLabels, formatAdoptionAge, formatAdoptionVerification, type AdoptionDog,
} from "@/lib/adoption";

function Info({ label, value }: { label: string; value: string }) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }

export function AdoptionDetail({ dog }: { dog: AdoptionDog }) {
  const orgHref = adoptionOrganizationHref(dog);
  const breedHref = adoptionBreedHref(dog);
  const stale = (dog.status === "ACTIVE" || dog.status === "RESERVED") && adoptionIsStale(dog.lastVerifiedAt);
  const contactHref = dog.contactUrl || (dog.contactEmail ? `mailto:${dog.contactEmail}` : dog.contactPhone ? `tel:${dog.contactPhone.replace(/\s+/g,"")}` : dog.externalSourceUrl);
  return <main id="obsah" className={styles.detailPage}><div className="shell">
    <nav className={styles.breadcrumbs}><Link href="/">Domov</Link><span>/</span><Link href="/pomoc-psom">Pomoc psom</Link><span>/</span><Link href="/pomoc-psom/adopcia">Psy na adopciu</Link><span>/</span><span>{dog.name}</span></nav>
    <div className={styles.detailGrid}><div><div className={styles.detailPhoto}>{dog.mainImage ? <img src={dog.mainImage} alt={`${dog.name} – pes na adopciu`} /> : <span aria-hidden="true">🐕</span>}<strong data-status={dog.status}>{adoptionStatusLabels[dog.status]}</strong></div>{dog.gallery.length > 0 && <div className={styles.gallery}>{dog.gallery.slice(0,6).map((image,i)=><img src={image} alt={`${dog.name} – fotografia ${i+2}`} key={image}/>)}</div>}</div>
      <article className={styles.detailMain}><p className={styles.location}>{dog.city}{dog.district ? ` · okres ${dog.district}` : ""}{dog.region ? ` · ${dog.region}` : ""}</p><h1>{dog.name}</h1><p className={styles.lead}>{dog.shortDescription}</p>
        {stale && <div className={styles.warning} role="status"><strong>Profil potrebuje nové overenie</strong><p>Údaje neboli potvrdené viac ako 30 dní. Pred cestou alebo rozhodnutím si dostupnosť over priamo s organizáciou.</p></div>}
        <dl className={styles.facts}><Info label="Vek" value={formatAdoptionAge(dog)} /><Info label="Pohlavie" value={adoptionSexLabels[dog.sex]} /><Info label="Veľkosť" value={adoptionSizeLabels[dog.size]} />{dog.weight !== null && <Info label="Hmotnosť" value={`${dog.weight} kg`} />}<Info label="Aktivita" value={adoptionActivityLabels[dog.activityLevel]} /></dl>
        <section><h2>Kto sa o psa stará</h2><p>{orgHref ? <Link href={orgHref}><strong>{dog.organizationName}</strong></Link> : <strong>{dog.organizationName || "Organizácia zatiaľ nie je prepojená"}</strong>}</p><p>{formatAdoptionVerification(dog.lastVerifiedAt)}</p></section>
        {(dog.breedName || breedHref) && <section><h2>Plemeno alebo typ</h2><p>{dog.breedMix ? "Kríženec · " : ""}{breedHref ? <Link href={breedHref}>{dog.breedName}</Link> : dog.breedName}</p></section>}
        <section><h2>Kompatibilita</h2><dl className={styles.compat}><Info label="Deti" value={adoptionCompatibilityLabels[dog.suitableForChildren]} /><Info label="Psy" value={adoptionCompatibilityLabels[dog.suitableForDogs]} /><Info label="Mačky" value={adoptionCompatibilityLabels[dog.suitableForCats]} /><Info label="Iné zvieratá" value={adoptionCompatibilityLabels[dog.suitableForOtherAnimals]} /><Info label="Byt" value={adoptionBooleanLabel(dog.apartmentSuitable)} /><Info label="Pre začiatočníka" value={adoptionBooleanLabel(dog.beginnerSuitable)} /></dl></section>
        {dog.temperament && <section><h2>Charakter</h2><p className={styles.preline}>{dog.temperament}</p></section>}
        <section><h2>Príbeh psa</h2><p className={styles.preline}>{dog.description}</p></section>
        <section><h2>Zdravie</h2><dl className={styles.compat}><Info label="Očkovanie" value={adoptionVaccinationLabels[dog.vaccinationStatus]} /><Info label="Čip" value={adoptionBooleanLabel(dog.chipped)} /><Info label="Kastrácia" value={adoptionBooleanLabel(dog.neutered)} /></dl>{dog.healthNotes && <p className={styles.preline}>{dog.healthNotes}</p>}{dog.specialNeeds && <><h3>Špeciálne potreby</h3><p className={styles.preline}>{dog.specialNeeds}</p></>}</section>
        {dog.adoptionRequirements && <section><h2>Aký domov hľadá</h2><p className={styles.preline}>{dog.adoptionRequirements}</p></section>}
      </article>
      <aside className={styles.cta}><span className="eyebrow">Ďalší krok</span><h2>{dog.status === "ACTIVE" ? `Zaujíma ťa ${dog.name}?` : adoptionStatusLabels[dog.status]}</h2>{dog.status === "ACTIVE" ? <><p>Kontaktuj priamo organizáciu. Psipedia adopciu nesprostredkúva a nerozhoduje o umiestnení psa.</p>{contactHref ? <a className={styles.primary} href={contactHref} rel="nofollow noreferrer" target={contactHref.startsWith("http") ? "_blank" : undefined}>Kontaktovať organizáciu</a> : <p><strong>Kontaktný odkaz zatiaľ nie je zverejnený.</strong></p>}</> : <p>Tento pes momentálne nie je vedený ako voľný na adopciu. Profil nechávame dostupný pre transparentnosť a zdieľané odkazy.</p>}{dog.externalSourceUrl && dog.externalSourceUrl !== contactHref && <a href={dog.externalSourceUrl} target="_blank" rel="nofollow noreferrer">Pôvodný zdroj ↗</a>}<Link href="/pomoc-psom/adopcia">← Ďalšie psy</Link></aside>
    </div>
  </div></main>;
}
