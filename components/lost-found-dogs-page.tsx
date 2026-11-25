import { PublicHeading } from "@/components/public-heading";
import {
  PublicFilterLayout,
  PublicFilterPanel,
  PublicResultsToolbar,
  PublicActiveFilters,
} from "@/components/public-filters";
import { PublicHelpProfileCard } from "@/components/public-visual-system/public-help-profile-card";
import {
  PublicHelpCategoryNav,
  publicHelpCategoryItems,
} from "@/components/public-visual-system/public-help-category-nav";
import { PublicFilterDisclosure } from "@/components/public-filter-disclosure";
import { PublicMediaFallback } from "@/components/public-visual-system/public-media-fallback";
import { PublicEmptyState } from "@/components/public-visual-system/public-result-states";
import {
  PublicSelect,
  PublicTextInput,
} from "@/components/public-visual-system/public-form-controls";
import { ImageDisplay } from "@/components/image-display";
import Link from "next/link";
import { redirect } from "next/navigation";
import { StructuredData } from "@/components/structured-data";
import {
  PublicContentShell,
  PublicFoundation,
  PublicPagination,
  PublicFilterTag,
  UnifiedSectionHero,
  UnifiedSectionHeroShell,
} from "@/components/public-visual-system";
import { HomePortalSearch } from "@/components/home-portal-search";
import { PublicHelpPhotoBanner, lostFoundSubmitPromo } from "@/components/public-visual-system/public-help-banner";
import { slovakRegions } from "@/lib/events";
import { listPublicDogReports, listPublishedBreedOptions } from "@/lib/lost-found-dog-store";
import { getSectionHeroVisual } from "@/lib/section-visual-store";
import { buildCollectionPageJsonLd, resolveListingIndexPolicy } from "@/lib/listing-seo";
import {
  dogReportBasePath,
  dogReportHref,
  dogReportTypeLabel,
  dogReportStatusLabel,
  activeDogReportCountNoun,
  dogReportTypeShortLabel,
  formatDogReportDate,
  type DogReportType,
  type DogSex,
  type DogSize,
} from "@/lib/lost-found-dogs";
import styles from "./lost-found-dogs.module.css";

type Search = Record<string, string | string[] | undefined>;
const scalar = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] || "" : value || "";

type ReportScope = DogReportType | "all";

function reportBasePath(type: ReportScope) {
  return type === "all" ? "/pomoc-psom/stratene-a-najdene" : dogReportBasePath(type);
}

function pageHref(type: ReportScope, params: URLSearchParams, page: number) {
  const next = new URLSearchParams(params);
  if (page <= 1) next.delete("page");
  else next.set("page", String(page));
  const query = next.toString();
  return reportBasePath(type) + (query ? "?" + query : "") + "#lost-found-results";
}

export async function LostFoundDogsPage({
  type,
  searchParams,
}: {
  type: ReportScope;
  searchParams: Promise<Search>;
}) {
  const raw = await searchParams;
  const q = scalar(raw.q).slice(0, 120);
  const region = scalar(raw.region).slice(0, 80);
  const locality = scalar(raw.locality).slice(0, 120);
  const date = scalar(raw.date).slice(0, 10);
  const sex = scalar(raw.sex) as DogSex | "";
  const size = scalar(raw.size) as DogSize | "";
  const breedIdValue = Number(scalar(raw.breed));
  const page = Math.max(1, Number.parseInt(scalar(raw.page) || "1", 10) || 1);
  const breedId = Number.isInteger(breedIdValue) && breedIdValue > 0 ? breedIdValue : null;
  const basePath = reportBasePath(type);
  const policy = resolveListingIndexPolicy(basePath, raw, { indexPagination: true });

  const [result, breeds, sharedHeroVisual] = await Promise.all([
    listPublicDogReports(type, {
      q,
      region,
      locality,
      date,
      sex,
      size,
      breedId,
      page,
      pageSize: 24,
    }),
    listPublishedBreedOptions(),
    getSectionHeroVisual("help.stratene-a-najdene"),
  ]);
  const heroVisual = {
    ...sharedHeroVisual,
    heroContent: sharedHeroVisual.heroContent
      ? { config: sharedHeroVisual.heroContent.config }
      : undefined,
  };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({
    q,
    region,
    locality,
    date,
    sex,
    size,
    breed: breedId ? String(breedId) : "",
  }))
    if (value) params.set(key, value);
  if (page > result.page) redirect(pageHref(type, params, result.page));
  const selectedFilters = [...params].map(([key, value]) => ({
    key,
    value,
    label:
      (
        {
          q: "Hľadanie",
          region: "Kraj",
          locality: "Lokalita",
          date: "Dátum",
          sex: "Pohlavie",
          size: "Veľkosť",
          breed: "Plemeno",
        } as Record<string, string>
      )[key] ?? key,
  }));
  const removeFilterHref = (key: string) => {
    const next = new URLSearchParams(params);
    next.delete(key);
    return basePath + (next.size ? "?" + next.toString() : "");
  };
  const label = type === "all" ? "všetky" : dogReportTypeShortLabel(type).toLowerCase();
  const title = type === "all" ? "Stratené a nájdené psy" : type === "LOST" ? "Stratené psy" : "Nájdené psy";
  const intro =
    type === "all"
      ? "Aktuálne hlásenia o stratených a nájdených psoch na Slovensku. Vyhľadajte psa podľa lokality alebo ďalších údajov."
      : type === "LOST"
        ? "Aktívne hlásenia o stratených psoch. Lokalita je zámerne iba približná a súkromné kontaktné údaje automaticky nezverejňujeme."
      : "Aktívne hlásenia o nájdených psoch. Pomôžte spojiť psa s oprávneným majiteľom bez zverejňovania zbytočne presných osobných údajov.";
  const schema =
    policy.kind === "query"
      ? null
      : buildCollectionPageJsonLd({
          name: title,
          description: intro,
          path: policy.canonicalPath,
          breadcrumbs: [
            { name: "Domov", path: "/" },
            { name: "Pomoc psom", path: "/pomoc-psom" },
            { name: title, path: basePath },
          ],
          items: result.items.map((report) => ({
            name: report.dogName || report.breed || dogReportTypeLabel(report.type),
            path: dogReportHref(report),
          })),
        });

  return (
    <>
      {schema && <StructuredData value={schema} />}
      <main id="obsah" tabIndex={-1}>
        <PublicFoundation className={styles.foundation}>
          <UnifiedSectionHeroShell>
            <UnifiedSectionHero
              breadcrumbs={
                <nav className={styles.breadcrumbs} aria-label="Drobečková navigácia">
                  <Link href="/">Domov</Link>
                  <span aria-hidden="true">/</span>
                  <Link href="/pomoc-psom">Pomoc psom</Link>
                  <span aria-hidden="true">/</span>
                  <span aria-current="page">{title}</span>
                </nav>
              }
              eyebrow="Pomoc psom · aktuálne hlásenia"
              title={title}
              intro={intro}
              visual={heroVisual}
              portalSearchSlot={
                <HomePortalSearch
                  action={basePath}
                  panelLabel={`Vyhľadávanie: ${title}`}
                  eyebrow="ČO HĽADÁŠ?"
                  title={type === "all" ? "Nájdi psa" : `Nájdi ${type === "FOUND" ? "nájdeného" : "strateného"} psa`}
                  shortcuts={[]}
                  searchScope="lost-found"
                  buttonLabel="Hľadať"
                  allowEmpty
                  hidden={[
                    { name: "region", value: region },
                    { name: "locality", value: locality },
                    { name: "date", value: date },
                    { name: "sex", value: sex },
                    { name: "size", value: size },
                    { name: "breed", value: breedId ? String(breedId) : "" },
                  ].filter((field) => Boolean(field.value))}
                  id={`lost-found-hero-${type.toLowerCase()}`}
                  label={type === "all" ? "Hľadať medzi všetkými hláseniami" : `Hľadať medzi ${type === "FOUND" ? "nájdenými" : "stratenými"} psami`}
                  placeholder="Hľadať psa, plemeno alebo mesto…"
                  defaultValue={q}
                />
              }
              ctaSlot={
                type !== "all" ? <div className={styles.headerActions}>
                  <Link
                    className="button button--dark"
                    href={
                      type === "LOST"
                        ? "/partner/koncepty/novy/strateny"
                        : "/partner/koncepty/novy/najdeny"
                    }
                  >
                    {type === "LOST" ? "Nahlásiť strateného psa" : "Nahlásiť nájdeného psa"}
                  </Link>
                </div> : undefined
              }
              metaSlot={
                <span>
                  <strong>{result.total}</strong> {activeDogReportCountNoun(result.total)}
                </span>
              }
            />
          </UnifiedSectionHeroShell>

          <PublicContentShell variant="listing" className={styles.listingShell}>
            <div className={styles.categoryNavShell}>
              <PublicHelpCategoryNav
                items={publicHelpCategoryItems("stratene-a-najdene")}
                reportScope={type}
              />
            </div>
            {type === "all" && <PublicHelpPhotoBanner promo={lostFoundSubmitPromo} />}
            <PublicFilterLayout>
              <PublicFilterPanel title="Filtrovať hlásenia" resetHref={basePath}>
                <PublicFilterDisclosure
                  label="Filtrovať hlásenia"
                  activeCount={[region, locality, date, sex, size, breedId].filter(Boolean).length}
                  buttonClassName={styles.filterToggle}
                  contentClassName={styles.filterDisclosure}
                  openContentClassName={styles.filterDisclosureOpen}
                >
                  <form
                    className={styles.filters}
                    method="get"
                    aria-label={"Filtrovať " + label + " psy"}
                  >
                    <input type="hidden" name="q" value={q} />
                    <div className={styles.field}>
                      <label htmlFor="lf-region">Kraj</label>
                      <PublicSelect
                        appearance="context"
                        id="lf-region"
                        name="region"
                        defaultValue={region}
                      >
                        <option value="">Všetky kraje</option>
                        {slovakRegions
                          .filter((item) => item !== "Online")
                          .map((item) => (
                            <option key={item} value={item}>
                              {item}
                            </option>
                          ))}
                      </PublicSelect>
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="lf-locality">Okres alebo lokalita</label>
                      <PublicTextInput
                        appearance="context"
                        id="lf-locality"
                        name="locality"
                        defaultValue={locality}
                        placeholder="napr. Nitra"
                      />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="lf-date">Dátum udalosti</label>
                      <PublicTextInput
                        appearance="context"
                        id="lf-date"
                        name="date"
                        type="date"
                        defaultValue={date}
                      />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="lf-sex">Pohlavie</label>
                      <PublicSelect appearance="context" id="lf-sex" name="sex" defaultValue={sex}>
                        <option value="">Všetky</option>
                        <option value="MALE">Pes</option>
                        <option value="FEMALE">Sučka</option>
                        <option value="UNKNOWN">Neznáme</option>
                      </PublicSelect>
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="lf-size">Veľkosť</label>
                      <PublicSelect
                        appearance="context"
                        id="lf-size"
                        name="size"
                        defaultValue={size}
                      >
                        <option value="">Všetky</option>
                        <option value="SMALL">Malý</option>
                        <option value="MEDIUM">Stredný</option>
                        <option value="LARGE">Veľký</option>
                        <option value="UNKNOWN">Neznáma</option>
                      </PublicSelect>
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="lf-breed">Plemeno</label>
                      <PublicSelect
                        appearance="context"
                        id="lf-breed"
                        name="breed"
                        defaultValue={breedId ? String(breedId) : ""}
                      >
                        <option value="">Všetky plemená</option>
                        {breeds.map((breed) => (
                          <option key={breed.id} value={breed.id}>
                            {breed.name}
                          </option>
                        ))}
                      </PublicSelect>
                    </div>
                    <div className={styles.actions}>
                      <button type="submit">Filtrovať</button>
                    </div>
                  </form>
                </PublicFilterDisclosure>
                {selectedFilters.length ? (
                  <PublicActiveFilters>
                    {selectedFilters.map((entry) => (
                      <PublicFilterTag
                        key={entry.key}
                        href={removeFilterHref(entry.key)}
                        removeLabel={`Odstrániť filter ${entry.label}`}
                      >
                        {entry.label}:{" "}
                        {entry.key === "sex"
                          ? (
                              { MALE: "Pes", FEMALE: "Sučka", UNKNOWN: "Neznáme" } as Record<
                                string,
                                string
                              >
                            )[entry.value]
                          : entry.key === "size"
                            ? (
                                {
                                  SMALL: "Malý",
                                  MEDIUM: "Stredný",
                                  LARGE: "Veľký",
                                  UNKNOWN: "Neznáma",
                                } as Record<string, string>
                              )[entry.value]
                            : entry.key === "breed"
                              ? (breeds.find((b) => String(b.id) === entry.value)?.name ??
                                "Vybrané plemeno")
                              : entry.value}{" "}
                        ×
                      </PublicFilterTag>
                    ))}
                  </PublicActiveFilters>
                ) : null}
              </PublicFilterPanel>
              <div id="lost-found-results" data-public-filter-results>
                <PublicResultsToolbar className={styles.summary}>
                  <PublicHeading role="section" as="h2">
                    {type === "all" ? "Všetky hlásenia" : title}
                  </PublicHeading>
                  <p>
                    {result.total} {activeDogReportCountNoun(result.total)}
                  </p>
                </PublicResultsToolbar>
                {result.items.length ? (
                  <div className={styles.grid}>
                    {result.items.map((report) => (
                      <PublicHelpProfileCard
                        key={report.id}
                        data-dog-report-card={report.id}
                        href={dogReportHref(report)}
                        title={report.dogName || report.breed || "Pes bez známeho mena"}
                        category={dogReportTypeLabel(report.type)}
                        actionLabel="Zobraziť hlásenie"
                        badge={
                          report.status === "ACTIVE" ? undefined : (
                            <span className={styles.badge}>
                              {dogReportStatusLabel[report.status]}
                            </span>
                          )
                        }
                        media={
                          <Link
                            href={dogReportHref(report)}
                            aria-label={
                              "Otvoriť hlásenie: " + (report.dogName || report.breed || "Pes")
                            }
                          >
                            {report.mainImage ? (
                              <ImageDisplay
                                roleHint="generic"
                                context="thumbnail"
                                fallbackOnError
                                config={report.thumbnailImageDisplay}
                                src={report.mainImage}
                                alt={
                                  report.dogName
                                    ? dogReportTypeShortLabel(report.type) + " pes " + report.dogName
                                    : dogReportTypeLabel(report.type)
                                }
                                loading="lazy"
                                decoding="async"
                              />
                            ) : (
                              <PublicMediaFallback appearance="context" decorative />
                            )}
                          </Link>
                        }
                        meta={[report.city, report.district, formatDogReportDate(report.eventDate)]
                          .filter(Boolean)
                          .join(" · ")}
                        excerpt={report.description}
                      />
                    ))}
                  </div>
                ) : (
                  <PublicEmptyState variant="context" className={styles.empty}>
                    <PublicHeading role="section" as="h2">
                      Momentálne nemáme publikovaný prípad pre tieto filtre.
                    </PublicHeading>
                    <p>Skúste zmeniť lokalitu, dátum alebo ďalšie filtre.</p>
                  </PublicEmptyState>
                )}

                <PublicPagination
                  variant="reports"
                  label="Stránkovanie hlásení"
                  currentPage={result.page}
                  totalPages={result.pages}
                  previousHref={
                    result.page > 1 ? pageHref(type, params, result.page - 1) : undefined
                  }
                  nextHref={
                    result.page < result.pages ? pageHref(type, params, result.page + 1) : undefined
                  }
                  previousLabel="←"
                  nextLabel="→"
                  previousAriaLabel="Predchádzajúca strana"
                  nextAriaLabel="Ďalšia strana"
                  pageHref={(page) => pageHref(type, params, page)}
                  currentPageAsText
                  showDisabledControls={false}
                />
              </div>
            </PublicFilterLayout>
          </PublicContentShell>
        </PublicFoundation>
      </main>
    </>
  );
}
