import Link from "next/link";
import { HelpBrowser } from "@/components/help-browser";
import { AlertCircleIcon, HelpCategoryIcon, ShieldCheckIcon } from "@/components/help-public-icons";
import { ArrowIcon } from "@/components/icons";
import {
  PublicActionLink,
  PublicDataCard,
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
  return "Otvoriť prehľad";
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
            variant="compact"
            eyebrow={active ? "Pomoc psom · databáza" : "Praktická pomoc · aktuálne dáta"}
            title={active?.label ?? "Pomoc psom"}
            intro={active?.description ?? "Vyberte typ pomoci, použite filtre a prejdite priamo na aktuálne prípady, adopcie, hlásenia alebo organizácie."}
            meta={
              <div className={styles.headerMeta}>
                {activeCount !== null ? <span><strong>{activeCount}</strong> aktívnych záznamov</span> : null}
                {!active && totalActive !== null ? <span><strong>{totalActive}</strong> aktívnych záznamov v dostupných moduloch</span> : null}
                <span><ShieldCheckIcon size={17} /> Zobrazujeme iba publikované údaje</span>
              </div>
            }
          />
        </div>

        <section className={[styles.shell, styles.categorySection].join(" ")} aria-labelledby="help-categories-heading">
          <div className={styles.sectionHeading}>
            <div><h2 id="help-categories-heading">Vyberte typ pomoci</h2></div>
            <p>Každý modul používa vlastné canonical dáta a filtre. Adopcie, hlásenia a organizácie zostávajú oddelené.</p>
          </div>
          <div className={styles.categoryGrid} data-help-category-nav>
            {helpCategories.map((category) => {
              const count = categoryCounts[category.slug];
              return (
                <PublicDataCard
                  className={[styles.categoryCard, active?.slug === category.slug ? styles.categoryCardActive : ""].filter(Boolean).join(" ")}
                  href={categoryDestination(category.slug)}
                  title={category.label}
                  description={category.description}
                  eyebrow={typeof count === "number" ? String(count) + " aktívnych" : undefined}
                  icon={<HelpCategoryIcon category={category.slug} />}
                  actionLabel={categoryActionLabel(category.slug)}
                  key={category.slug}
                />
              );
            })}
          </div>

          <div className={styles.reportBanner}>
            <div className={styles.reportCopy}>
              <AlertCircleIcon size={24} />
              <div><strong>Našli ste psa v núdzi?</strong><p>Najprv zaistite bezpečnosť a postupujte podľa krátkeho praktického návodu.</p></div>
            </div>
            <PublicActionLink href="/pomoc-psom/nahlasit-psa-v-nudzi" variant="secondary" icon={<ArrowIcon size={16} />}>
              Čo urobiť teraz
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
