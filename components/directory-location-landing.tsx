import { Fragment } from "react";
import Link from "next/link";
import { Breadcrumbs } from "@/components/page-system";
import { DirectoryCard } from "@/components/directory-card";
import { PawMark } from "@/components/icons";
import {
  PublicContentShell,
  PublicContextBanner,
  PublicFoundation,
} from "@/components/public-visual-system";
import {
  buildDirectoryLocationLandingBreadcrumbs,
  type DirectoryLocationLanding,
} from "@/lib/directory-location-landings";
import styles from "@/components/directory-public.module.css";

function profileCountLabel(count: number) {
  return count === 1 ? "profil" : count > 1 && count < 5 ? "profily" : "profilov";
}

export function DirectoryLocationLandingPage({ landing }: { landing: DirectoryLocationLanding }) {
  const breadcrumbs = buildDirectoryLocationLandingBreadcrumbs(landing);
  const hasMapData = landing.profiles.some((profile) => Boolean(profile.city || profile.region));

  return (
    <main id="obsah" className={styles.page}>
      <PublicFoundation className={styles.foundation}>
        <PublicContentShell variant="plain" className={styles.headerShell}>
          <Breadcrumbs>
            {breadcrumbs.map((breadcrumb, index) => (
              <Fragment key={breadcrumb.path}>
                {index > 0 && <span>/</span>}
                {index === breadcrumbs.length - 1
                  ? <span>{breadcrumb.name}</span>
                  : <Link href={breadcrumb.path}>{breadcrumb.name}</Link>}
              </Fragment>
            ))}
          </Breadcrumbs>
          <header className={styles.header}>
            <span className="eyebrow">{landing.categoryLabel}</span>
            <h1>{landing.h1}</h1>
            <p>{landing.intro}</p>
            <p><strong>{landing.total} {profileCountLabel(landing.total)}</strong></p>
          </header>
        </PublicContentShell>

        <section className={styles.resultsSection} aria-labelledby="directory-location-results">
          <PublicContentShell variant="listing" className={styles.resultsShell}>
            <div className="directory-result-heading">
              <div>
                <span className="eyebrow">Výsledky</span>
                <h2 id="directory-location-results">{landing.categoryLabel}</h2>
              </div>
              <strong>{landing.total} {profileCountLabel(landing.total)}</strong>
            </div>
            <div className={`directory-grid ${styles.listGrid}`} data-directory-list>
              {landing.profiles.map((profile) => <DirectoryCard profile={profile} key={profile.id} />)}
            </div>
          </PublicContentShell>
        </section>

        {hasMapData && (
          <section className={styles.contextSection}>
            <PublicContentShell variant="plain" className={styles.contextShell}>
              <PublicContextBanner
                eyebrow="Mapa Psipedie"
                title="Pozrite si služby a miesta aj na mape"
                text="Mapa pomáha overiť polohu verejne dostupných profilov a nájsť ďalšie možnosti v okolí."
                ctaLabel="Pozrieť mapu"
                ctaHref="/mapa"
                icon={<PawMark size={20} />}
                tone="forest"
              />
            </PublicContentShell>
          </section>
        )}
      </PublicFoundation>
    </main>
  );
}
