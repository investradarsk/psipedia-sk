import Link from "next/link";
import { Breadcrumbs } from "@/components/page-system";
import {
  PublicActionLink,
  PublicContentList,
  PublicContentListItem,
  PublicFoundation,
  PublicSectionHeader,
} from "@/components/public-visual-system";
import type { Article } from "@/lib/content";
import { getNewsCategory, newsCategories, type NewsCategorySlug } from "@/lib/news";
import { articleHref, articlePortalSection, type PortalSection } from "@/lib/portal";
import { serializeJsonLd, SITE_URL } from "@/lib/seo";
import styles from "./news-hub.module.css";

const NEWS_DESCRIPTION = "Kompletný archív publikovaných správ, príbehov, výskumu a užitočných tém zo sveta psov.";

export function NewsHub({
  articles,
  section,
  activeCategory,
}: {
  articles: Article[];
  section: PortalSection;
  activeCategory?: NewsCategorySlug;
}) {
  const category = activeCategory ? getNewsCategory(activeCategory) : null;
  const allNews = articles.filter((article) => articlePortalSection(article) === "novinky");
  const newsArticles = category
    ? allNews.filter((article) => article.newsCategory === category.slug)
    : allNews;
  const archivePath = category ? `/novinky/${category.slug}` : "/novinky";
  const title = category ? category.label : "Novinky zo sveta psov";
  const intro = category
    ? category.description
    : "Všetky publikované novinky na jednom mieste. Vyber si kategóriu alebo prejdi celý archív od najnovších článkov.";
  const schema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    url: `${SITE_URL}${archivePath}`,
    description: category?.description ?? NEWS_DESCRIPTION,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: newsArticles.length,
      itemListElement: newsArticles.map((article, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `${SITE_URL}${articleHref(article)}`,
        name: article.title,
      })),
    },
  };

  return (
    <PublicFoundation className={styles.foundation}>
      <main id="obsah">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }} />
        <div className={`${styles.headerShell} shell`}>
          <Breadcrumbs label="Navigácia v novinkách">
            <Link href="/">Domov</Link><span>/</span>
            {category ? <><Link href="/novinky">Novinky</Link><span>/</span><span>{category.label}</span></> : <span>Novinky</span>}
          </Breadcrumbs>
          <PublicSectionHeader
            variant="compact"
            eyebrow="Redakčný archív"
            title={title}
            intro={intro}
            meta={`${newsArticles.length} ${newsArticles.length === 1 ? "publikovaný článok" : "publikovaných článkov"}`}
          />
        </div>

        <section className={`${styles.archive} shell`} aria-labelledby="news-archive-title">
          <div className={styles.archiveHeader}>
            <div>
              <span className="eyebrow">Kategórie</span>
              <h2 id="news-archive-title">{category ? `Archív: ${category.label}` : "Všetky publikované novinky"}</h2>
            </div>
            <nav className={styles.filters} aria-label="Filtrovať novinky podľa kategórie">
              <Link href="/novinky" aria-current={!category ? "page" : undefined}>Všetky</Link>
              {newsCategories.map((item) => (
                <Link
                  href={`/novinky/${item.slug}`}
                  aria-current={category?.slug === item.slug ? "page" : undefined}
                  key={item.slug}
                >
                  {item.shortLabel}
                </Link>
              ))}
            </nav>
          </div>

          {newsArticles.length ? (
            <PublicContentList label={category ? `Novinky: ${category.label}` : "Všetky novinky"}>
              {newsArticles.map((article) => {
                const articleCategory = getNewsCategory(article.newsCategory);
                return (
                  <PublicContentListItem
                    key={article.slug}
                    href={articleHref(article)}
                    title={article.title}
                    eyebrow={articleCategory?.label ?? "Zo sveta psov"}
                    excerpt={article.excerpt}
                    meta={`${article.date} · ${article.readTime} čítania`}
                    image={article.image ? { src: article.image, alt: article.title } : undefined}
                    actionLabel="Čítať novinku"
                  />
                );
              })}
            </PublicContentList>
          ) : (
            <div className={styles.empty}>
              <strong>V tejto kategórii zatiaľ nie je publikovaná novinka.</strong>
              <p>Skús celý archív alebo inú kategóriu.</p>
              <PublicActionLink href="/novinky" variant="secondary">Zobraziť všetky</PublicActionLink>
            </div>
          )}
        </section>

        <section className={`${styles.footerTools} shell`} aria-label="Redakčné informácie">
          <div>
            <span className="eyebrow">Máš tip?</span>
            <h2>Upozorni Psipediu na tému, ktorú sa oplatí overiť.</h2>
            <p>Tip pred publikovaním preveríme a pri správe uvádzame zdroje aj dátum aktualizácie.</p>
          </div>
          <div className={styles.footerActions}>
            <PublicActionLink href="/novinky/poslat-tip" variant="primary">Poslať tip</PublicActionLink>
            <PublicActionLink href="/zasady-obsahu" variant="secondary">Ako overujeme obsah</PublicActionLink>
          </div>
        </section>
      </main>
    </PublicFoundation>
  );
}
