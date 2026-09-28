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
        <section className={[styles.shell, styles.headerWrap].join(" ")} data-help-public-header>
          <nav className={styles.breadcrumbs} aria-label="Drobečková navigácia">
            <Link href="/">Domov</Link><span aria-hidden="true">/</span>
            {active ? <><Link href="/pomoc-psom">Pomoc psom</Link><span aria-hidden="true">/</span><span aria-current="page">{active.label}</span></> : <span aria-current="page">Pomoc psom</span>}
          </nav>

          <PublicSectionHeader
            className={styles.heroHeader}
            variant="compact"
            eyebrow={active ? "Pomoc psom · aktuálny prehľad" : "Pomoc psom · tam, kde ju treba"}
            title={active?.label ?? "Pomoc psom"}
            intro={active?.description ?? "Adopcie, útulky, dočasná opatera, zbierky aj stratené psy na jednom mieste. Nájdite konkrétnu pomoc alebo spôsob, ako sa zapojiť."}
            meta={
              <div className={styles.headerMeta}>
                {activeCount !== null ? <span><strong>{activeCount}</strong> aktívnych záznamov</span> : null}
                {!active && totalActive !== null ? <span><strong>{totalActive}</strong> aktívnych záznamov</span> : null}
                <span><ShieldCheckIcon size={17} /> Zobrazujeme iba publikované údaje</span>
              </div>
            }
          />
        </section>

        <HelpBrowser items={browserItems} initialCategory={initialCategory}>
          {!active && (
            <section className={styles.categoryBlock} aria-labelledby="help-categories-heading">
              <div className={styles.categoryHeading}>
                <div>
                  <span className={styles.sectionEyebrow}>Kategórie pomoci</span>
                  <h2 id="help-categories-heading">Vyberte, čo chcete riešiť</h2>
                </div>
                <p>Vyberte oblasť a prejdite priamo na adopcie, organizácie, dočasnú opateru, zbierky alebo hlásenia.</p>
              </div>

              <nav className={styles.categoryNav} data-help-category-nav aria-label="Kategórie pomoci">
                {helpCategories.map((category) => {
                  const count = categoryCounts[category.slug];
                  return (
                    <Link href={categoryDestination(category.slug)} key={category.slug}>
                      <HelpCategoryIcon category={category.slug} size={18} />
                      <span>{category.label}</span>
                      {typeof count === "number" ? <small>{count}</small> : null}
                    </Link>
                  );
                })}
              </nav>
            </section>
          )}

          <aside className={styles.reportBanner} aria-label="Rýchla pomoc pri nájdenom psovi">
            <div className={styles.reportCopy}>
              <span className={styles.reportIcon}><AlertCircleIcon size={22} /></span>
              <div>
                <span className={styles.reportEyebrow}>Rýchla pomoc</span>
                <strong>Našli ste psa v núdzi?</strong>
                <p>Čo urobiť na mieste, koho kontaktovať a ktoré informácie si hneď zaznamenať.</p>
              </div>
            </div>
            <PublicActionLink href="/pomoc-psom/nahlasit-psa-v-nudzi" variant="secondary" icon={<ArrowIcon size={16} />}>
              Postup krok za krokom
            </PublicActionLink>
          </aside>
        </HelpBrowser>

        <section className={styles.closingCta} aria-labelledby="help-closing-cta-heading">
          <div className={styles.closingCtaOverlay}>
            <div className={[styles.shell, styles.closingCtaInner].join(" ")}>
              <span className={styles.closingEyebrow}>Každá pomoc má zmysel</span>
              <h2 id="help-closing-cta-heading">Pomáhajme spolu</h2>
              <p>Lepší svet pre psov vzniká vďaka ľuďom, ktorí nechcú zostať bokom.</p>
              <PublicActionLink href="/pomoc-psom/dobrovolnictvo" variant="primary" icon={<ArrowIcon size={16} />}>
                Chcem pomôcť
              </PublicActionLink>
            </div>
          </div>
        </section>
      </PublicFoundation>
    </main>
  );
}
