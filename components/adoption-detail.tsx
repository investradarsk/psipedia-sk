import Link from "next/link";
import {
  adoptionDetailActivityLabels,
  adoptionDetailBooleanLabel,
  adoptionDetailCompatibilityLabels,
  adoptionDetailIsStale,
  adoptionDetailSexLabels,
  adoptionDetailSizeLabels,
  adoptionDetailStatusLabels,
  adoptionDetailVaccinationLabels,
  buildAdoptionDetailSections,
  formatAdoptionDetailAge,
  formatAdoptionDetailVerification,
  type PublicAdoptionDetailDog,
} from "@/lib/adoption-detail";
import styles from "./adoption-detail.module.css";

type Fact = { label: string; value: string };

function Facts({ items }: { items: Fact[] }) {
  if (!items.length) return null;
  return <dl className={styles.detailFacts}>{items.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>;
}

function DetailImage({ dog }: { dog: PublicAdoptionDetailDog }) {
  if (dog.mainImage) return <img src={dog.mainImage} alt={`${dog.name} – pes na adopciu`} />;
  return <div className={styles.detailImageFallback} aria-hidden="true"><span /></div>;
}

export function AdoptionDetail({ dog }: { dog: PublicAdoptionDetailDog }) {
  const sections = buildAdoptionDetailSections(dog);
  const age = formatAdoptionDetailAge(dog);
  const verifiedAt = formatAdoptionDetailVerification(dog.lastVerifiedAt);
  const stale = adoptionDetailIsStale(dog);
  const basicFacts: Fact[] = [
    age ? { label: "Vek", value: age } : null,
    dog.sex !== "UNKNOWN" ? { label: "Pohlavie", value: adoptionDetailSexLabels[dog.sex] } : null,
    dog.size !== "UNKNOWN" ? { label: "Veľkosť", value: adoptionDetailSizeLabels[dog.size] } : null,
    dog.weight !== null ? { label: "Hmotnosť", value: `${dog.weight} kg` } : null,
    dog.color.trim() ? { label: "Farba", value: dog.color } : null,
    dog.activityLevel !== "UNKNOWN" ? { label: "Aktivita", value: adoptionDetailActivityLabels[dog.activityLevel] } : null,
  ].filter((item): item is Fact => Boolean(item));
  const compatibilityFacts: Fact[] = [
    dog.suitableForChildren !== "UNKNOWN" ? { label: "Deti", value: adoptionDetailCompatibilityLabels[dog.suitableForChildren] } : null,
    dog.suitableForDogs !== "UNKNOWN" ? { label: "Psy", value: adoptionDetailCompatibilityLabels[dog.suitableForDogs] } : null,
    dog.suitableForCats !== "UNKNOWN" ? { label: "Mačky", value: adoptionDetailCompatibilityLabels[dog.suitableForCats] } : null,
    dog.suitableForOtherAnimals !== "UNKNOWN" ? { label: "Iné zvieratá", value: adoptionDetailCompatibilityLabels[dog.suitableForOtherAnimals] } : null,
    adoptionDetailBooleanLabel(dog.apartmentSuitable) ? { label: "Byt", value: adoptionDetailBooleanLabel(dog.apartmentSuitable)! } : null,
    adoptionDetailBooleanLabel(dog.beginnerSuitable) ? { label: "Pre začiatočníka", value: adoptionDetailBooleanLabel(dog.beginnerSuitable)! } : null,
    dog.needsExperiencedOwner ? { label: "Skúsený majiteľ", value: "Odporúčaný" } : null,
  ].filter((item): item is Fact => Boolean(item));
  const healthFacts: Fact[] = [
    dog.vaccinationStatus !== "UNKNOWN" ? { label: "Očkovanie", value: adoptionDetailVaccinationLabels[dog.vaccinationStatus] } : null,
    adoptionDetailBooleanLabel(dog.chipped) ? { label: "Čip", value: adoptionDetailBooleanLabel(dog.chipped)! } : null,
    adoptionDetailBooleanLabel(dog.neutered) ? { label: "Kastrácia", value: adoptionDetailBooleanLabel(dog.neutered)! } : null,
  ].filter((item): item is Fact => Boolean(item));
  const location = [dog.city, dog.district ? `okres ${dog.district}` : "", dog.region].filter(Boolean).join(" · ");
  const phoneHref = dog.contactPhone ? `tel:${dog.contactPhone.replace(/\s+/g, "")}` : null;

  return <main id="obsah" tabIndex={-1} className={styles.detailShell}>
    <nav className={styles.breadcrumbs} aria-label="Drobečková navigácia">
      <Link href="/">Domov</Link><span>/</span><Link href="/pomoc-psom">Pomoc psom</Link><span>/</span><Link href="/pomoc-psom/adopcia">Psy na adopciu</Link><span>/</span><span>{dog.name}</span>
    </nav>

    {dog.status === "RESERVED" && <div className={styles.reservedBanner} role="status"><strong>Rezervovaný</strong><span>Tento pes je momentálne rezervovaný a nemusí byť dostupný na adopciu.</span></div>}

    <section className={styles.detailHero}>
      <div className={styles.detailVisual}>
        <DetailImage dog={dog} />
        <span className={`${styles.statusBadge} ${dog.status === "RESERVED" ? styles.reserved : styles.active}`}>{adoptionDetailStatusLabels[dog.status]}</span>
      </div>
      <div className={styles.detailIntro}>
        <span className={styles.eyebrow}>Pomoc psom · adopcia</span>
        <h1>{dog.name}</h1>
        {location && <p className={styles.detailLocation}>📍 {location}</p>}
        {dog.breedName && <p className={styles.detailBreed}>{dog.breedMix ? "Kríženec · " : ""}{dog.breedName}</p>}
        {dog.shortDescription && <p className={styles.detailLead}>{dog.shortDescription}</p>}
        <Facts items={basicFacts} />
        {stale && <div className={styles.staleNotice}><strong>Profil potrebuje nové overenie</strong><span>Pred rozhodnutím si aktuálnu dostupnosť potvrďte priamo s organizáciou.</span></div>}
      </div>
    </section>

    <div className={styles.detailGrid}>
      <article className={styles.detailContent}>
        {sections.story && <section className={styles.detailPanel}><span className={styles.detailEyebrow}>O psovi</span><h2>Príbeh a informácie</h2><p className={styles.preline}>{dog.description}</p></section>}
        {sections.temperament && <section className={styles.detailPanel}><span className={styles.detailEyebrow}>Povaha</span><h2>Charakter</h2><p className={styles.preline}>{dog.temperament}</p></section>}
        {sections.compatibility && <section className={styles.detailPanel}><span className={styles.detailEyebrow}>Domácnosť</span><h2>Kompatibilita</h2><Facts items={compatibilityFacts} /></section>}
        {sections.health && <section className={styles.detailPanel}><span className={styles.detailEyebrow}>Zdravie</span><h2>Zdravotné informácie</h2><Facts items={healthFacts} />{dog.healthNotes.trim() && <p className={styles.preline}>{dog.healthNotes}</p>}{dog.specialNeeds.trim() && <><h3>Špeciálne potreby</h3><p className={styles.preline}>{dog.specialNeeds}</p></>}</section>}
        {sections.requirements && <section className={styles.detailPanel}><span className={styles.detailEyebrow}>Nový domov</span><h2>Podmienky adopcie</h2><p className={styles.preline}>{dog.adoptionRequirements}</p></section>}
        {sections.gallery && <section className={styles.detailPanel}><span className={styles.detailEyebrow}>Fotografie</span><h2>Galéria</h2><div className={styles.detailGallery}>{dog.gallery.filter(Boolean).slice(0, 6).map((image, index) => <img key={`${image}-${index}`} src={image} alt={`${dog.name} – fotografia ${index + 2}`} />)}</div></section>}
      </article>

      <aside className={styles.detailAside} aria-label="Kontakt a overenie">
        {sections.contact && <section className={styles.contactCard}>
          <span className={styles.detailEyebrow}>Kontakt</span>
          <h2>{dog.organizationName || "Kontakt k adopcii"}</h2>
          {dog.status === "ACTIVE" ? <p>O dostupnosti a podmienkach adopcie rozhoduje uvedená organizácia alebo zodpovedná osoba.</p> : <p>Profil je rezervovaný. Aktuálny stav si overte priamo u uvedeného kontaktu.</p>}
          <div className={styles.contactLinks}>
            {dog.contactUrl && <a href={dog.contactUrl} target="_blank" rel="nofollow noreferrer">Kontaktný odkaz ↗</a>}
            {dog.contactEmail && <a href={`mailto:${dog.contactEmail}`}>{dog.contactEmail}</a>}
            {dog.contactPhone && phoneHref && <a href={phoneHref}>{dog.contactPhone}</a>}
            {dog.externalSourceUrl && dog.externalSourceUrl !== dog.contactUrl && <a href={dog.externalSourceUrl} target="_blank" rel="nofollow noreferrer">Pôvodný zdroj ↗</a>}
          </div>
        </section>}
        <section className={styles.verificationCard}>
          <span className={styles.detailEyebrow}>Aktuálnosť</span>
          <h2>Overenie profilu</h2>
          {verifiedAt ? <p>Posledné overenie: <strong>{verifiedAt}</strong></p> : <p>Dátum posledného overenia nie je uvedený.</p>}
          <Link href="/pomoc-psom/adopcia">← Späť na psy na adopciu</Link>
        </section>
      </aside>
    </div>
  </main>;
}
