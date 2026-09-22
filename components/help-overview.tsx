import Link from "next/link";
import { HelpCategoryIcon, ShieldCheckIcon } from "@/components/help-public-icons";
import { ArrowIcon, PawMark } from "@/components/icons";
import {
  PublicActionLink,
  PublicFoundation,
  PublicSectionHeader,
} from "@/components/public-visual-system";
import type { HelpCategorySlug } from "@/lib/help";
import styles from "./help-public.module.css";

export type HelpOverviewItem = {
  id: string;
  href: string;
  title: string;
  imageUrl: string | null;
  eyebrow: string;
  meta: string;
  excerpt: string;
  badge?: string | null;
  urgent?: boolean;
};

export type HelpOverviewSection = {
  slug: HelpCategorySlug;
  label: string;
  description: string;
  href: string;
  count: number;
  items: HelpOverviewItem[];
};

type PromoBanner = {
  eyebrow: string;
  title: string;
  text: string;
  href: string;
  action: string;
  tone: "care" | "rescue" | "volunteer";
};

const promos: Record<number, PromoBanner> = {
  0: {
    eyebrow: "Praktické rady",
    title: "Dobrý nový domov začína prípravou",
    text: "Starostlivosť, zdravie, prvé dni aj každodenné fungovanie so psom nájdete v našich praktických témach.",
    href: "/starostlivost",
    action: "Prejsť na starostlivosť",
    tone: "care",
  },
  2: {
    eyebrow: "Rýchla pomoc",
    title: "Našli ste psa v núdzi?",
    text: "Pozrite si jednoduchý postup: čo urobiť na mieste, koho kontaktovať a ktoré informácie si hneď zaznamenať.",
    href: "/pomoc-psom/nahlasit-psa-v-nudzi",
    action: "Postup krok za krokom",
    tone: "rescue",
  },
  4: {
    eyebrow: "Zapojte sa",
    title: "Pomoc nemusí byť iba finančná",
    text: "Venčenie, prevoz, dočasná opatera, fotografovanie alebo zdieľanie môžu organizáciám výrazne pomôcť.",
    href: "/pomoc-psom/dobrovolnictvo",
    action: "Ako môžem pomôcť",
    tone: "volunteer",
  },
};

function OverviewCard({ item }: { item: HelpOverviewItem }) {
  return (
    <article className={styles.overviewCard} data-help-overview-card>
      <Link className={styles.overviewMedia} href={item.href} aria-label={`Otvoriť: ${item.title}`}>
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className={styles.overviewMediaFallback} aria-hidden="true"><PawMark size={34} /></span>
        )}
        {item.badge ? (
          <span className={[styles.overviewBadge, item.urgent ? styles.overviewBadgeUrgent : ""].filter(Boolean).join(" ")}>
            {item.badge}
          </span>
        ) : null}
      </Link>
      <div className={styles.overviewCardCopy}>
        <span className={styles.overviewEyebrow}>{item.eyebrow}</span>
        <h3><Link href={item.href}>{item.title}</Link></h3>
        {item.meta ? <p className={styles.overviewMeta}>{item.meta}</p> : null}
        {item.excerpt ? <p className={styles.overviewExcerpt}>{item.excerpt}</p> : null}
        <Link className={styles.overviewCardAction} href={item.href}>
          Zobraziť detail <ArrowIcon size={16} />
        </Link>
      </div>
    </article>
  );
}

function Promo({ promo }: { promo: PromoBanner }) {
  return (
    <aside className={[styles.overviewPromo, styles[`overviewPromo_${promo.tone}`]].join(" ")}>
      <div className={styles.overviewPromoShade}>
        <div className={styles.overviewPromoCopy}>
          <span>{promo.eyebrow}</span>
          <h2>{promo.title}</h2>
          <p>{promo.text}</p>
          <PublicActionLink href={promo.href} variant="primary" icon={<ArrowIcon size={16} />}>
            {promo.action}
          </PublicActionLink>
        </div>
      </div>
    </aside>
  );
}

export function HelpOverview({
  sections,
  totalActive,
}: {
  sections: HelpOverviewSection[];
  totalActive: number;
}) {
  return (
    <main id="obsah" tabIndex={-1}>
      <PublicFoundation className={styles.foundation}>
        <section className={[styles.shell, styles.headerWrap].join(" ")}>
          <nav className={styles.breadcrumbs} aria-label="Drobečková navigácia">
            <Link href="/">Domov</Link><span aria-hidden="true">/</span><span aria-current="page">Pomoc psom</span>
          </nav>
          <PublicSectionHeader
            className={styles.heroHeader}
            variant="compact"
            eyebrow="Pomoc psom · tam, kde ju treba"
            title="Pomoc psom"
            intro="Adopcie, útulky, dočasná opatera, zbierky aj stratené psy na jednom mieste. Hlavný prehľad ukazuje len výber aktuálnych možností; celý zoznam nájdete v každej kategórii."
            meta={
              <div className={styles.headerMeta}>
                <span><strong>{totalActive}</strong> aktívnych záznamov</span>
                <span><ShieldCheckIcon size={17} /> Zobrazujeme iba publikované údaje</span>
              </div>
            }
          />
        </section>

        <section className={[styles.shell, styles.overviewCategoryBlock].join(" ")} aria-labelledby="help-categories-heading">
          <div className={styles.overviewHeading}>
            <div>
              <span className={styles.sectionEyebrow}>Kategórie pomoci</span>
              <h2 id="help-categories-heading">Vyberte, čo chcete riešiť</h2>
            </div>
            <p>Každá kategória má vlastný úplný prehľad a filtre. Tu vidíte iba najnovší výber, aby bola stránka rýchla a prehľadná.</p>
          </div>

          <nav className={styles.overviewCategoryGrid} data-help-category-nav aria-label="Kategórie pomoci">
            {sections.map((section) => (
              <Link href={section.href} key={section.slug}>
                <span className={styles.overviewCategoryIcon}><HelpCategoryIcon category={section.slug} size={22} /></span>
                <span className={styles.overviewCategoryCopy}>
                  <strong>{section.label}</strong>
                  <small>{section.description}</small>
                </span>
                <span className={styles.overviewCategoryCount}>{section.count}</span>
                <ArrowIcon size={17} />
              </Link>
            ))}
          </nav>
        </section>

        <div className={styles.overviewFlow}>
          {sections.map((section, index) => {
            const promo = promos[index];
            return (
              <div key={section.slug}>
                <section className={styles.overviewSection} aria-labelledby={`help-overview-${section.slug}`} data-help-overview-section={section.slug}>
                  <div className={[styles.shell, styles.overviewSectionInner].join(" ")}>
                    <div className={styles.overviewSectionHeading}>
                      <div>
                        <span className={styles.sectionEyebrow}>Pomoc psom</span>
                        <h2 id={`help-overview-${section.slug}`}>{section.label}</h2>
                        <p>{section.description}</p>
                      </div>
                      <PublicActionLink href={section.href} variant="secondary" icon={<ArrowIcon size={16} />}>
                        Zobraziť všetky
                      </PublicActionLink>
                    </div>

                    {section.items.length ? (
                      <div className={styles.overviewGrid}>
                        {section.items.slice(0, 6).map((item) => <OverviewCard item={item} key={item.id} />)}
                      </div>
                    ) : (
                      <div className={styles.overviewEmpty}>
                        <p>V tejto kategórii momentálne nemáme nový publikovaný záznam.</p>
                        <Link href={section.href}>Otvoriť kategóriu <ArrowIcon size={15} /></Link>
                      </div>
                    )}
                  </div>
                </section>
                {promo ? <Promo promo={promo} /> : null}
              </div>
            );
          })}
        </div>

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
