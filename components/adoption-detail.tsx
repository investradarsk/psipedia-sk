import Link from "next/link";
import { DetailHero } from "./detail-primitives/detail-primitives";
import { PublicHelpProfileDetailLayout } from "@/components/public-visual-system/public-help-profile-detail-layout";
import { LocationIcon } from "@/components/help-public-icons";
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
import type { AdoptionPublicOrganizationLink } from "@/lib/adoption-store";
import styles from "./adoption-detail.module.css";
import { ImageDisplay } from "@/components/image-display";
import { PublicMediaFallback, PublicPhotoGallery } from "@/components/public-visual-system";

type Fact = { label: string; value: string };

function Facts({ items }: { items: Fact[] }) {
  if (!items.length) return null;
  return <dl className={styles.detailFacts}>{items.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>;
}


export function AdoptionDetail({ dog, organization }: { dog: PublicAdoptionDetailDog; organization: AdoptionPublicOrganizationLink | null }) {
  const sections = buildAdoptionDetailSections(dog);
  const age = formatAdoptionDetailAge(dog);
  const verifiedAt = formatAdoptionDetailVerification(dog.lastVerifiedAt);
  const updatedAt = formatAdoptionDetailVerification(dog.updatedAt);
  const stale = adoptionDetailIsStale(dog);
  const basicFacts: Fact[] = [
    age ? { label: "Vek", value: age } : null,
    dog.sex !== "UNKNOWN" ? { label: "Pohlavie", value: adoptionDetailSexLabels[dog.sex] } : null,
    dog.size !== "UNKNOWN" ? { label: "Veľkosť", value: adoptionDetailSizeLabels[dog.size] } : null,
    dog.weight !== null && Number.isFinite(dog.weight) && dog.weight > 0 ? { label: "Hmotnosť", value: `${dog.weight} kg` } : null,
    dog.color.trim() ? { label: "Farba", value: dog.color } : null,
    dog.activityLevel !== "UNKNOWN" ? { label: "Aktivita", value: adoptionDetailActivityLabels[dog.activityLevel] } : null,
    updatedAt ? { label: "Aktualizované", value: updatedAt } : null,
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
  // Suppress only the generic repeated label, never a named mixed breed.
  const genericBreedName = ["kríženec", "krizenec"].includes(dog.breedName.trim().toLocaleLowerCase("sk"));

  return <main id="obsah" tabIndex={-1} className={styles.detailShell} data-adoption-source="canonical">
    <DetailHero kind="adoption" breadcrumbs={    <nav className={styles.breadcrumbs} aria-label="Drobečková navigácia">
      <Link href="/">Domov</Link><span>/</span><Link href="/pomoc-psom">Pomoc psom</Link><span>/</span><Link href="/pomoc-psom/adopcia">Psy na adopciu</Link><span>/</span><span>{dog.name}</span>
    </nav>}
      media={dog.mainImage ? <ImageDisplay roleHint="generic" fallbackOnError context="detail" config={dog.detailImageDisplay} src={dog.mainImage} alt={`${dog.name} – pes na adopciu`} loading="eager" fetchPriority="high" /> : <PublicMediaFallback size="detail" label={`Fotografia psa ${dog.name} zatiaľ nie je dostupná`} />}
      copy={<>    {dog.status === "RESERVED" && <div className={styles.reservedBanner} role="status"><strong>Rezervovaný</strong><span>Tento pes je momentálne rezervovaný a nemusí byť dostupný na adopciu.</span></div>}
        <span className={`${styles.statusBadge} ${dog.status === "RESERVED" ? styles.reserved : styles.active}`}>{adoptionDetailStatusLabels[dog.status]}</span>
        <h1>{dog.name}</h1>
        {location && <p className={styles.detailLocation}><LocationIcon size={16} /> {location}</p>}
        {dog.breedName && <p className={styles.detailBreed}>{dog.breedMix && !genericBreedName ? "Kríženec · " : ""}{dog.breedSlug ? <Link href={`/plemena/${dog.breedSlug}`}>{dog.breedName}</Link> : dog.breedName}</p>}
        {dog.shortDescription && <p className={styles.detailLead}>{dog.shortDescription}</p>}
        <Facts items={basicFacts} />
        {verifiedAt && <p className={styles.detailVerification}>Naposledy potvrdená dostupnosť: <strong>{verifiedAt}</strong></p>}
        {stale && <div className={styles.staleNotice}><strong>Profil potrebuje potvrdiť aktuálnosť</strong><span>Pred rozhodnutím si aktuálnu dostupnosť potvrďte priamo s organizáciou.</span></div>}

<nav className={styles.heroActions} aria-label="Kontakt k adopcii">
          {sections.contact && <a className={styles.primaryAction} href="#adoption-contact">Kontaktovať organizáciu</a>}
          {organization && <Link className={styles.secondaryAction} href={`/organizacie/${organization.slug}`}>Zobraziť profil organizácie</Link>}
        </nav></>} />

    <PublicHelpProfileDetailLayout>
      <article className={styles.detailContent}>
        {sections.story && <section className={styles.detailPanel}><h2>Príbeh a informácie</h2><p className={styles.preline}>{dog.description}</p></section>}
        {sections.temperament && <section className={styles.detailPanel}><h2>Charakter</h2><p className={styles.preline}>{dog.temperament}</p></section>}
        {sections.compatibility && <section className={styles.detailPanel}><h2>Kompatibilita</h2><Facts items={compatibilityFacts} /></section>}
        {sections.health && <section className={styles.detailPanel}><h2>Zdravotné informácie</h2><Facts items={healthFacts} />{dog.healthNotes.trim() && <p className={styles.preline}>{dog.healthNotes}</p>}{dog.specialNeeds.trim() && <><h3>Špeciálne potreby</h3><p className={styles.preline}>{dog.specialNeeds}</p></>}</section>}
        {sections.requirements && <section className={styles.detailPanel}><h2>Podmienky adopcie</h2><p className={styles.preline}>{dog.adoptionRequirements}</p></section>}
        {sections.gallery && <section className={styles.detailPanel}><h2>Galéria</h2><PublicPhotoGallery label={`Fotografie psa ${dog.name}`} images={dog.gallery.filter(Boolean).slice(0, 6).map((image, index) => ({ src: image, alt: `${dog.name} – fotografia ${index + 2}` }))} /></section>}
      </article>

      <aside className={styles.detailAside} aria-label="Kontakt a aktuálnosť profilu">
        {sections.contact && <section className={styles.contactCard} id="adoption-contact">
          <h2>{organization ? <Link className={styles.organizationLink} href={`/organizacie/${organization.slug}`}>{organization.name}</Link> : dog.organizationName || "Kontakt k adopcii"}</h2>
          {dog.status === "ACTIVE" ? <p>O dostupnosti a podmienkach adopcie rozhoduje uvedená organizácia alebo zodpovedná osoba.</p> : <p>Profil je rezervovaný. Aktuálny stav si overte priamo u uvedeného kontaktu.</p>}
          <div className={styles.contactLinks}>
            {dog.contactUrl && <a href={dog.contactUrl} target="_blank" rel="nofollow noreferrer">Kontakt cez stránku organizácie</a>}
            {dog.contactEmail && <a href={`mailto:${dog.contactEmail}`}>{dog.contactEmail}</a>}
            {dog.contactPhone && phoneHref && <a href={phoneHref}>{dog.contactPhone}</a>}
            {dog.externalSourceUrl && dog.externalSourceUrl !== dog.contactUrl && <a href={dog.externalSourceUrl} target="_blank" rel="nofollow noreferrer">Pôvodný zdroj</a>}
          </div>
        </section>}

      </aside>
    </PublicHelpProfileDetailLayout>
  </main>;
}
