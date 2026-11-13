import Link from "next/link";
import {
  DetailActions,
  DetailContactsCard,
  DetailFactList,
  DetailFactsCard,
  DetailHero,
  DetailParagraphs,
  DetailSection,
  type DetailContact,
} from "./detail-primitives/detail-primitives";
import { PublicHelpProfileDetailLayout } from "@/components/public-visual-system/public-help-profile-detail-layout";
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
import { ImageDisplay } from "@/components/image-display";
import { responsiveMediaSrcSet } from "@/lib/responsive-media";
import { PublicActionLink, PublicMediaFallback, PublicPhotoGallery } from "@/components/public-visual-system";
import { breedProfileHref } from "@/lib/breed-canonical";
import dogStyles from "./lost-found-dogs.module.css";
import styles from "./adoption-detail.module.css";

type Fact = { label: string; value: string };

export function AdoptionDetail({ dog, organization }: {
  dog: PublicAdoptionDetailDog;
  organization: AdoptionPublicOrganizationLink | null;
}) {
  const sections = buildAdoptionDetailSections(dog);
  const age = formatAdoptionDetailAge(dog);
  const verifiedAt = formatAdoptionDetailVerification(dog.lastVerifiedAt);
  const updatedAt = formatAdoptionDetailVerification(dog.updatedAt);
  const stale = adoptionDetailIsStale(dog);
  const location = [dog.city, dog.district ? `okres ${dog.district}` : "", dog.region].filter(Boolean).join(" · ");
  const phoneHref = dog.contactPhone ? `tel:${dog.contactPhone.replace(/[^+\d]/g, "")}` : null;
  const hasContact = sections.contact || Boolean(organization);
  // Suppress only the generic repeated label, never a named mixed breed.
  const genericBreedName = ["kríženec", "krizenec"].includes(dog.breedName.trim().toLocaleLowerCase("sk"));

  const basicFacts: Fact[] = [
    age ? { label: "Vek", value: age } : null,
    dog.sex !== "UNKNOWN" ? { label: "Pohlavie", value: adoptionDetailSexLabels[dog.sex] } : null,
    dog.size !== "UNKNOWN" ? { label: "Veľkosť", value: adoptionDetailSizeLabels[dog.size] } : null,
    dog.weight !== null && Number.isFinite(dog.weight) && dog.weight > 0
      ? { label: "Hmotnosť", value: `${dog.weight} kg` } : null,
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

  // Canonical adoption fields are already public. No private submission or moderation data is used.
  const contacts: DetailContact[] = [
    ...(organization ? [{
      label: "Organizácia",
      value: <Link className={styles.organizationLink} href={`/organizacie/${organization.slug}`}>{organization.name}</Link>,
    }] : dog.organizationName.trim() ? [{ label: "Organizácia", value: dog.organizationName }] : []),
    ...(phoneHref ? [{ label: "Telefón", value: <a href={phoneHref}>{dog.contactPhone}</a> }] : []),
    ...(dog.contactEmail ? [{ label: "E-mail", value: <a href={`mailto:${dog.contactEmail}`}>{dog.contactEmail}</a> }] : []),
    ...(dog.contactUrl ? [{
      label: "Kontakt",
      value: <a href={dog.contactUrl} target="_blank" rel="nofollow noreferrer">Kontakt cez stránku organizácie ↗</a>,
    }] : []),
    ...(dog.externalSourceUrl && dog.externalSourceUrl !== dog.contactUrl ? [{
      label: "Pôvodný zdroj",
      value: <a href={dog.externalSourceUrl} target="_blank" rel="nofollow noreferrer">Otvoriť pôvodný zdroj ↗</a>,
    }] : []),
  ];
  const photos = dog.gallery.filter(Boolean).slice(0, 6);

  return <main id="obsah" tabIndex={-1} className={dogStyles.detail} data-adoption-source="canonical">
    <DetailHero
      kind="adoption"
      breadcrumbs={<nav className={dogStyles.crumbs} aria-label="Omrvinková navigácia">
        <Link href="/pomoc-psom">Pomoc psom</Link><span aria-hidden="true">/</span>
        <Link href="/pomoc-psom/adopcia">Psy na adopciu</Link><span aria-hidden="true">/</span>
        <span>{dog.name}</span>
      </nav>}
      media={dog.mainImage
        ? <ImageDisplay roleHint="generic" fallbackOnError context="detail" config={dog.detailImageDisplay}
            src={dog.mainImage} alt={`${dog.name} – pes na adopciu`} loading="eager" fetchPriority="high"
            srcSet={responsiveMediaSrcSet(dog.mainImage, [480, 640, 960, 1280, 1600])}
            sizes="(max-width: 760px) 100vw, 50vw" />
        : <PublicMediaFallback size="detail" label={`Fotografia psa ${dog.name} zatiaľ nie je dostupná`} />}
      copy={<>
        <div className={`${dogStyles.statusBanner} ${dog.status === "RESERVED" ? styles.reservedBanner : ""}`}
          data-state={dog.status} role="status">
          <strong>{adoptionDetailStatusLabels[dog.status]}</strong>
          <span>{dog.status === "RESERVED"
            ? "Tento pes je momentálne rezervovaný a nemusí byť dostupný na adopciu."
            : "Tento pes je aktuálne ponúkaný na adopciu."}</span>
        </div>
        <span className={`${dogStyles.badge} ${styles.adoptionBadge}`}>PES NA ADOPCIU</span>
        <h1>{dog.name}</h1>
        <div className={dogStyles.detailMeta}>
          {location && <span><strong>Lokalita</strong> {location}</span>}
          {dog.breedName && <span><strong>Plemeno</strong> <span className={styles.detailBreed}>
            {dog.breedMix && !genericBreedName ? "Kríženec · " : ""}
            {dog.breedSlug ? <Link href={breedProfileHref(dog.breedSlug, dog.breedFciGroup ?? undefined)}>{dog.breedName}</Link> : dog.breedName}
          </span></span>}
        </div>
        {verifiedAt && <p className={styles.detailVerification}>Naposledy potvrdená dostupnosť: <strong>{verifiedAt}</strong></p>}
        {dog.shortDescription && <p className={dogStyles.detailLead}>{dog.shortDescription}</p>}
        {stale && <div className={styles.staleNotice}>
          <strong>Profil potrebuje potvrdiť aktuálnosť</strong>
          <span>Pred rozhodnutím si aktuálnu dostupnosť potvrďte priamo s organizáciou.</span>
        </div>}
        <DetailActions>
          {hasContact && <PublicActionLink href="#adoption-contact">Kontaktovať organizáciu</PublicActionLink>}
          {phoneHref && <PublicActionLink href={phoneHref} variant="secondary">Zavolať</PublicActionLink>}
          {organization && <PublicActionLink href={`/organizacie/${organization.slug}`} variant="secondary">Profil organizácie</PublicActionLink>}
        </DetailActions>
      </>}
    />

    <PublicHelpProfileDetailLayout>
      <article className={dogStyles.detailCopy}>
        {sections.story && <DetailSection compactHeading title="Popis">
          <DetailParagraphs value={dog.description} />
        </DetailSection>}
        {sections.gallery && <DetailSection compactHeading title="Ďalšie fotografie">
          <PublicPhotoGallery variant="linked" fit="contain" className={dogStyles.reportGallery}
            label={`Galéria psa ${dog.name}`} maxImages={photos.length}
            images={dog.gallery.filter(Boolean).slice(0, 6).map((image, index) => ({
              src: image, alt: `${dog.name} – fotografia ${index + 2}`,
            }))} />
        </DetailSection>}
        {sections.temperament && <DetailSection compactHeading title="Charakter">
          <DetailParagraphs value={dog.temperament} />
        </DetailSection>}
        {sections.compatibility && <DetailSection compactHeading title="Kompatibilita">
          <DetailFactList facts={compatibilityFacts} />
        </DetailSection>}
        {sections.health && <DetailSection compactHeading title="Zdravotné informácie">
          {healthFacts.length > 0 && <DetailFactList facts={healthFacts} />}
          {dog.healthNotes.trim() && <DetailParagraphs value={dog.healthNotes} />}
          {dog.specialNeeds.trim() && <><h3>Špeciálne potreby</h3><DetailParagraphs value={dog.specialNeeds} /></>}
        </DetailSection>}
        {sections.requirements && <DetailSection compactHeading title="Podmienky adopcie">
          <DetailParagraphs value={dog.adoptionRequirements} />
        </DetailSection>}
      </article>

      <aside className={dogStyles.detailAside} aria-label="Kontakt a aktuálnosť profilu">
        <DetailContactsCard title="Adresa a kontakt" id="adoption-contact" contacts={contacts}
          emptyMessage="Priamy kontakt k adopcii zatiaľ nie je uvedený."
          note={dog.status === "ACTIVE"
            ? "O dostupnosti a podmienkach adopcie rozhoduje uvedená organizácia alebo zodpovedná osoba."
            : "Profil je rezervovaný. Aktuálny stav si overte priamo u uvedeného kontaktu."}
          noteTone="neutral" />
        <div className={dogStyles.safetyPanel}>
          <DetailSection compactHeading title="Bezpečná adopcia">
            <p>Pred stretnutím si overte totožnosť organizácie, aktuálny stav psa a podmienky adopcie. Kontaktné údaje používajte len na dohodnutie adopcie.</p>
          </DetailSection>
        </div>
        <DetailFactsCard title="Základné údaje" facts={basicFacts} />
        {location && <DetailSection compactHeading title="Lokalita">
          <p>{location}</p>
        </DetailSection>}
        <DetailFactsCard title="Aktuálnosť a zdroj" facts={[
          ...(verifiedAt ? [{ label: "Naposledy potvrdená dostupnosť", value: verifiedAt }] : []),
          ...(updatedAt ? [{ label: "Aktualizované", value: updatedAt }] : []),
        ]} />
      </aside>
    </PublicHelpProfileDetailLayout>
  </main>;
}
