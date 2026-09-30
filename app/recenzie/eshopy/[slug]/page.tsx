import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs, PageContainer } from "@/components/page-system";
import { ESHOP_RATING_FIELDS, getPublishedEshopBySlug } from "@/lib/eshop-ratings";
import styles from "./eshop-profile.module.css";

export const dynamic = "force-dynamic";

function format(value: number) {
  return new Intl.NumberFormat("sk-SK", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}

function countLabel(count: number) {
  if (count === 1) return "1 overené hodnotenie";
  if (count >= 2 && count <= 4) return `${count} overené hodnotenia`;
  return `${count} overených hodnotení`;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const shop = await getPublishedEshopBySlug(slug).catch(() => null);
  if (!shop) return {};
  return { title: `${shop.name} – hodnotenia e-shopu`, description: `Skúsenosti používateľov Psipedia.sk s e-shopom ${shop.name}. Hodnotenie doručenia, komunikácie, sortimentu, cien a celkovej skúsenosti.` };
}

export default async function EshopProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await getPublishedEshopBySlug(slug).catch(() => null);
  if (!shop) notFound();
  return (
    <main id="obsah" className={styles.page}>
      <PageContainer>
        <Breadcrumbs><Link href="/">Domov</Link><span>/</span><Link href="/recenzie?typ=eshopy">Recenzie a testy</Link><span>/</span><span>{shop.name}</span></Breadcrumbs>
        <section className={styles.hero}>
          <div>
            <span className="eyebrow">E-shop · hodnotenia Psipedia</span>
            <h1>{shop.name}</h1>
            <p>{shop.description}</p>
          </div>
          <div className={styles.heroActions}>
            <Link href={`/recenzie/eshopy/${shop.slug}/hodnotit`}>Ohodnotiť e-shop</Link>
            <a href={shop.websiteUrl} target="_blank" rel="noreferrer">Navštíviť e-shop ↗</a>
          </div>
        </section>

        {shop.averages ? (
          <section className={styles.summary} aria-label={`Hodnotenie e-shopu ${shop.name}`}>
            <div className={styles.score}>
              <strong>{format(shop.averages.overall)}</strong>
              <span>★ z 5 · {countLabel(shop.ratingCount)}</span>
            </div>
            <div className={styles.dimensions}>
              {ESHOP_RATING_FIELDS.map((field) => (
                <div className={styles.dimension} key={field.key}>
                  <span>{field.label}</span>
                  <strong>{format(shop.averages?.[field.key] ?? 0)} / 5</strong>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <section className={styles.zero}>
            <strong>Zatiaľ bez hodnotení</strong>
            <p>Buďte prvý, kto ohodnotí doručenie, komunikáciu, sortiment, ceny a celkovú skúsenosť.</p>
          </section>
        )}

        <section className={styles.info}>
          <strong>Bez registrácie a bez importovaných hviezdičiek</strong>
          <p>Na odoslanie hodnotenia stačí jednorazovo overiť e-mail. Jeden overený e-mail môže mať pre každý e-shop jedno hodnotenie a môže ho neskôr upraviť. Externé hodnotenia z Google, Heureky ani samotného e-shopu sa do priemeru Psipedia nezapočítavajú.</p>
        </section>
        <p className={styles.source}>Profilový popis vychádza z verejných údajov e-shopu. <a href={shop.sourceUrl} target="_blank" rel="noreferrer">Zdroj ↗</a></p>
      </PageContainer>
    </main>
  );
}
