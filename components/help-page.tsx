import Link from "next/link";
import { HelpBrowser } from "@/components/help-browser";
import { AlertCircleIcon, HelpCategoryIcon, ShieldCheckIcon } from "@/components/help-public-icons";
import { ArrowIcon } from "@/components/icons";
import {
  PublicActionLink,
  PublicFoundation,
  PublicSectionHeader,
} from "@/components/public-visual-system";
import {
  getHelpCategory,
  helpCategories,
  helpCategoryHref,
  type HelpCase,
  type HelpCategorySlug,
} from "@/lib/help";
import styles from "./help-public.module.css";

export type HelpCategoryCounts = Partial<Record<HelpCategorySlug, number>>;

type PublicHelpCategorySlug = (typeof helpCategories)[number]["slug"];

function categoryDestination(category: PublicHelpCategorySlug) {
  if (category === "adopcia") return "/pomoc-psom/adopcia";
  if (category === "stratene-a-najdene") return "/pomoc-psom/stratene-psy";
  return helpCategoryHref({ slug: category });
}

function categoryActionLabel(category: PublicHelpCategorySlug) {
  if (category === "adopcia") return "Zobraziť adopcie";
  if (category === "stratene-a-najdene") return "Zobraziť hlásenia";
  if (category === "utulky") return "Zobraziť organizácie";
  if (category === "docasna-opatera") return "Nájsť dočasnú opateru";
  if (category === "zbierky") return "Zobraziť výzvy";
  return "Ako môžem pomôcť";
}

export function HelpPage({
  items,
  initialCategory = "all",
  categoryCounts = {},
}: {
  items: HelpCase[];
  initialCategory?: "all" | HelpCategorySlug;
  categoryCounts?: HelpCategoryCounts;
}) {
  const active = initialCategory === "all" ? null : getHelpCategory(initialCategory);
  const activeCount = active
    ? categoryCounts[active.slug] ?? items.filter((item) => item.category === active.slug && !item.resolved).length
    : null;
  const countValues = Object.values(categoryCounts).filter((value): value is number => typeof value === "number");
  const totalActive = countValues.length ? countValues.reduce((sum, value) => sum + value, 0) : null;
  const summaryCount = active ? activeCount : totalActive;
  const browserItems = items.filter((item) => item.category !== "stratene-a-najdene");

  return (
    <main id="obsah" tabIndex={-1}>
      <PublicFoundation className={styles.foundation}>
        <div className={[styles.shell, styles.headerWrap].join(" ")}>
          <nav className={styles.breadcrumbs} aria-label="Drobečková navigácia">
            <Link href="/">Domov</Link><span aria-hidden="true">/</span>
            {active ? <><Link href="/pomoc-psom">Pomoc psom</Link><span aria-hidden="true">/</span><span aria-current="page">{active.label}</span></> : <span aria-current="page">Pomoc psom</span>}
          </nav>
          <PublicSectionHeader
            className={styles.heroHeader}
            variant="compact"
            eyebrow={active ? "Pomoc psom · aktuálny prehľad" : "Pomoc psom · tam, kde ju treba"}
            title={active?.label ?? "Pomoc psom"}
            intro={active?.description ?? "Adopcie, útulky, dočasná opatera, zbierky aj stratené psy na jednom mieste. Vyberte, kde chcete pomôcť alebo čo práve potrebujete vyriešiť."}
            meta={
              <div className={styles.headerMeta}>
                {activeCount !== null ? <span><strong>{activeCount}</strong> aktívnych záznamov</span> : null}
                {!active && totalActive !== null ? <span><strong>{totalActive}</strong> aktívnych záznamov</span> : null}
                <span><ShieldCheckIcon size={17} /> Zobrazujeme iba publikované údaje</span>
              </div>
            }
            visual={
              <div className={styles.heroPanel}>
                <span className={styles.heroPanelEyebrow}>{active ? "Aktuálny stav" : "Pomoc, ktorá vedie k akcii"}</span>
                <div className={styles.heroMetric}>
                  <strong>{summaryCount ?? helpCategories.length}</strong>
                  <span>{summaryCount !== null ? "aktívnych záznamov" : "spôsobov pomoci"}</span>
                </div>
                <p>
                  {active
                    ? "Prehľad je napojený na aktuálne publikované údaje v tejto sekcii."
                    : "Od nového domova cez dočasnú opateru až po rýchlu pomoc pri stratenom alebo nájdenom psovi."}
                </p>
              </div>
            }
          />
        </div>

        <section className={[styles.shell, styles.categorySection].join(" ")} aria-labelledby="help-categories-heading">
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.sectionEyebrow}>Vyberte, čo chcete riešiť</span>
              <h2 id="help-categories-heading">Pomôžte tam, kde je to práve potrebné</h2>
            </div>
            <p>Každá karta vás zoberie priamo na príslušný prehľad. Bez miešania adopcií, hlásení a organizácií do jedného zoznamu.</p>
          </div>
          <div className={styles.categoryGrid} data-help-category-nav>
            {helpCategories.map((category) => {
              const count = categoryCounts[category.slug];
              return (
                <Link
                  className={[styles.categoryCard, active?.slug === category.slug ? styles.categoryCardActive : ""].filter(Boolean).join(" ")}
                  href={categoryDestination(category.slug)}
                  key={category.slug}
                >
                  <span className={styles.categoryCardTop}>
                    <span className={styles.categoryIcon}><HelpCategoryIcon category={category.slug} size={25} /></span>
                    {typeof count === "number" ? (
                      <span className={styles.categoryCount}><strong>{count}</strong><span>aktívnych</span></span>
                    ) : null}
                  </span>
                  <span className={styles.categoryCardBody}>
                    <strong>{category.label}</strong>
                    <span>{category.description}</span>
                  </span>
                  <span className={styles.categoryCardAction}>
                    <span>{categoryActionLabel(category.slug)}</span>
                    <span className={styles.categoryArrow} aria-hidden="true"><ArrowIcon size={16} /></span>
                  </span>
                </Link>
              );
            })}
          </div>

          <div className={styles.reportBanner}>
            <div className={styles.reportCopy}>
              <span className={styles.reportIcon}><AlertCircleIcon size={24} /></span>
              <div>
                <span className={styles.reportEyebrow}>Rýchla pomoc</span>
                <strong>Našli ste psa v núdzi?</strong>
                <p>Čo urobiť na mieste, koho kontaktovať a ktoré informácie si hneď zaznamenať.</p>
              </div>
            </div>
            <PublicActionLink href="/pomoc-psom/nahlasit-psa-v-nudzi" variant="secondary" icon={<ArrowIcon size={16} />}>
              Postup krok za krokom
            </PublicActionLink>
          </div>
        </section>

        <section className={styles.resultsBand}>
          <div className={styles.shell}>
            <HelpBrowser items={browserItems} initialCategory={initialCategory} />
          </div>
        </section>
      </PublicFoundation>
    </main>
  );
}
