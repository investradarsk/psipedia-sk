import Link from "next/link";
import { ArticleCard } from "@/components/article-card";
import { ArrowIcon, BowlIcon, PawMark, SearchIcon, SparkIcon } from "@/components/icons";
import { Breadcrumbs, PageContainer } from "@/components/page-system";
import { PublicCategoryTiles, PublicFoundation, PublicLandingHero } from "@/components/public-visual-system";
import { directoryCategories, getDirectoryCategory } from "@/lib/directory";
import { ESHOP_RATING_FIELDS } from "@/lib/eshop-rating-domain";
import type { PublicEshop } from "@/lib/eshop-ratings";
import type { Article } from "@/lib/content";
import type { PortalSection } from "@/lib/portal";
import { articlePortalSection, portalSubpageHref } from "@/lib/portal";
import type { PublicProfileReviewFeedItem } from "@/lib/profile-review-read";
import styles from "./reviews-hub.module.css";

export type ReviewsHubView = "all" | "products" | "services" | "eshops";

export function normalizeReviewsHubView(value: string | undefined): ReviewsHubView {
  return value === "produkty"
    ? "products"
    : value === "sluzby"
      ? "services"
      : value === "eshopy"
        ? "eshops"
        : "all";
}

function viewHref(view: ReviewsHubView) {
  if (view === "products") return "/recenzie?typ=produkty#obsah-recenzie";
  if (view === "services") return "/recenzie?typ=sluzby#obsah-recenzie";
  if (view === "eshops") return "/recenzie?typ=eshopy#obsah-recenzie";
  return "/recenzie#obsah-recenzie";
}

function reviewDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("sk-SK", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Bratislava",
  }).format(date);
}

function reviewExcerpt(value: string) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > 240 ? `${clean.slice(0, 237)}…` : clean;
}

function profileTypeLabel(review: PublicProfileReviewFeedItem) {
  if (review.targetType === "HELP_ORGANIZATION") return "Organizácia";
  return getDirectoryCategory(review.targetCategory ?? "")?.label ?? "Služba pre psov";
}

function ReviewFeedCard({ review }: { review: PublicProfileReviewFeedItem }) {
  const date = reviewDate(review.publishedAt);
  return (
    <article className={styles.userReviewCard}>
      <header>
        <div>
          <span className={styles.reviewType}>{profileTypeLabel(review)}</span>
          <h3><Link href={review.targetHref}>{review.targetName}</Link></h3>
        </div>
        <strong className={styles.rating} aria-label={`Hodnotenie ${review.overallRating} z 5`}>
          {review.overallRating} <span aria-hidden="true">★</span>
        </strong>
      </header>
      <p>{reviewExcerpt(review.body)}</p>
      <footer>
        <span>{review.displayName}</span>
        {date ? <time dateTime={review.publishedAt}>{date}</time> : null}
        <Link href={`${review.targetHref}#recenzie`}>Celá recenzia <ArrowIcon size={16} /></Link>
      </footer>
    </article>
  );
}

const serviceCategorySlugs = new Set([
  "veterinari",
  "treneri",
  "kynologicke-kluby",
  "salony-a-sluzby",
  "hotely-a-opatrovanie",
  "fyzioterapia",
]);

export function ReviewsHub({
  section,
  articles,
  profileReviews,
  eshops,
  view = "all",
}: {
  section: PortalSection;
  articles: Article[];
  profileReviews: PublicProfileReviewFeedItem[];
  eshops: PublicEshop[];
  view?: ReviewsHubView;
}) {
  const reviewArticles = articles.filter((article) => articlePortalSection(article) === "recenzie");
  const subpages = section.subpages.filter((subpage) => subpage.visible !== false);
  const serviceCategories = directoryCategories.filter((category) => serviceCategorySlugs.has(category.slug));
  const showProducts = view === "all" || view === "products";
  const showServices = view === "all" || view === "services";
  const showEshops = view === "all" || view === "eshops";

  return (
    <main id="obsah">
      <PublicFoundation className={styles.foundation}>
      <header className={styles.hero}>
        <PageContainer>
          <Breadcrumbs>
            <Link href="/">Domov</Link><span>/</span><span>Recenzie a testy</span>
          </Breadcrumbs>
          <PublicLandingHero
            tone="reviews"
            eyebrow="Rozhodovanie podľa skúseností"
            title="Recenzie a testy"
            intro="Redakčné testy produktov a reálne skúsenosti používateľov so službami pre psov na jednom mieste."
            ornament={<SparkIcon size={96} />}
          >
            <form className={styles.search} action="/hladat" method="get">
              <SearchIcon size={21} />
              <input type="hidden" name="sekcia" value="recenzie" />
              <label className="sr-only" htmlFor="reviews-hub-query">Hľadať v recenziách a testoch</label>
              <input id="reviews-hub-query" name="q" maxLength={120} placeholder="Krmivo, GPS, veterinár, tréner…" />
              <button type="submit">Hľadať</button>
            </form>
          </PublicLandingHero>
        </PageContainer>
      </header>

      <section className={styles.modeSection} id="obsah-recenzie" aria-labelledby="reviews-mode-heading">
        <PageContainer>
          <div className={styles.modeHeading}>
            <span className={styles.eyebrow}>Vyber si, čo chceš pozrieť</span>
            <h2 id="reviews-mode-heading">Štyri jednoduché vstupy do recenzií</h2>
          </div>
          <PublicCategoryTiles
            label="Typ recenzií"
            items={[
              {
                href: viewHref("all"),
                title: "Všetko",
                description: "Testy produktov, skúsenosti so službami aj hodnotenia e-shopov na jednom mieste.",
                meta: view === "all" ? "Zobrazené" : "Otvoriť",
                icon: <SparkIcon size={22} />,
                current: view === "all",
                prefetch: false,
              },
              {
                href: viewHref("products"),
                title: "Produkty",
                description: "Redakčné testy krmív, výbavy a produktov pre psy.",
                meta: view === "products" ? "Zobrazené" : "Otvoriť",
                icon: <BowlIcon size={22} />,
                current: view === "products",
                rel: "nofollow",
                prefetch: false,
              },
              {
                href: viewHref("services"),
                title: "Služby",
                description: "Skúsenosti používateľov s veterinármi, trénermi a ďalšími službami.",
                meta: view === "services" ? "Zobrazené" : "Otvoriť",
                icon: <PawMark size={22} />,
                current: view === "services",
                rel: "nofollow",
                prefetch: false,
              },
              {
                href: viewHref("eshops"),
                title: "E-shopy",
                description: "Jednoduché hodnotenia nákupnej skúsenosti od e-mailom overených používateľov.",
                meta: view === "eshops" ? "Zobrazené" : "Otvoriť",
                icon: <SearchIcon size={22} />,
                current: view === "eshops",
                rel: "nofollow",
                prefetch: false,
              },
            ]}
          />
        </PageContainer>
      </section>

      <section className={styles.trustStrip} aria-label="Pravidlá hodnotenia">
        <PageContainer className={styles.trustGrid}>
          <div><strong>Redakčný test</strong><span>Metodika, podmienky testu a záver sú viditeľne oddelené od reklamy.</span></div>
          <div><strong>Hodnotenia používateľov</strong><span>Skóre Psipedia vzniká iba z používateľských recenzií a e-shop hodnotení od overených e-mailov.</span></div>
          <div><strong>Externé hodnotenia</strong><span>Google ani iné externé skóre nikdy nemiešame do priemeru Psipedia.</span></div>
        </PageContainer>
      </section>

      {showProducts ? (
        <>
          <section className={styles.section}>
            <PageContainer>
              <div className={styles.sectionHeading}>
                <div><span className={styles.eyebrow}>Najnovšie testy Psipedia</span><h2>Produkty, ktoré sme rozobrali prakticky</h2></div>
                <p>Pri každom teste uvádzame, čo bolo hodnotené, pre akého psa dáva produkt zmysel a či článok obsahuje partnerský alebo affiliate odkaz.</p>
              </div>
              {reviewArticles.length ? (
                <div className={styles.articleGrid}>
                  {reviewArticles.slice(0, 3).map((article) => {
                    const category = article.portalSubpage ? subpages.find((item) => item.slug === article.portalSubpage) : null;
                    return (
                      <ArticleCard
                        key={article.slug}
                        article={article}
                        large
                        topicHref={category ? portalSubpageHref(section, category) : "/recenzie"}
                        topicLabel={category?.label ?? "Recenzie a testy"}
                        actionLabel="Čítať test"
                      />
                    );
                  })}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <strong>Prvé redakčné testy pripravujeme.</strong>
                  <p>Kategórie sú hotové; po publikovaní sa test zobrazí automaticky tu aj vo svojej kategórii.</p>
                </div>
              )}
            </PageContainer>
          </section>

          <section className={styles.sectionAlt}>
            <PageContainer>
              <div className={styles.sectionHeading}>
                <div><span className={styles.eyebrow}>Kategórie produktov</span><h2>Čo chceš porovnať?</h2></div>
                <p>Každá kategória používa spravovanú taxonómiu Psipedia, takže redakcia môže obsah ďalej rozširovať bez nového systému.</p>
              </div>
              <div className={styles.categoryGrid}>
                {subpages.map((subpage) => {
                  const count = reviewArticles.filter((article) => article.portalSubpage === subpage.slug).length;
                  return (
                    <Link href={portalSubpageHref(section, subpage)} key={subpage.slug} className={styles.categoryCard}>
                      <span aria-hidden="true">{subpage.icon ?? "★"}</span>
                      <div><h3>{subpage.label}</h3><p>{subpage.description}</p><small>{count} {count === 1 ? "test" : count > 1 && count < 5 ? "testy" : "testov"}</small></div>
                      <ArrowIcon size={19} />
                    </Link>
                  );
                })}
              </div>
            </PageContainer>
          </section>
        </>
      ) : null}

      {showServices ? (
        <section className={styles.section}>
          <PageContainer>
            <div className={styles.sectionHeading}>
              <div><span className={styles.eyebrow}>Skúsenosti používateľov</span><h2>Najnovšie recenzie služieb</h2></div>
              <p>Ide o publikované recenzie priamo z profilov Psipedia. Hodnotenie služby zostáva naviazané na konkrétny profil a jeho vlastný priemer.</p>
            </div>
            {profileReviews.length ? (
              <div className={styles.reviewGrid}>
                {profileReviews.map((review) => <ReviewFeedCard key={review.id} review={review} />)}
              </div>
            ) : (
              <div className={styles.emptyState}>
                <strong>Zatiaľ bez publikovaných používateľských recenzií.</strong>
                <p>Keď používatelia pridajú prvé schválené hodnotenia na profiloch, najnovšie sa automaticky zobrazia aj tu.</p>
              </div>
            )}
            <div className={styles.serviceLinks}>
              {serviceCategories.map((category) => (
                <Link href={`/adresar/${category.slug}`} key={category.slug}>
                  <span aria-hidden="true">{category.icon}</span>
                  <strong>{category.label}</strong>
                  <ArrowIcon size={17} />
                </Link>
              ))}
            </div>
          </PageContainer>
        </section>
      ) : null}

      {showEshops ? (
        <section className={styles.sectionAlt}>
          <PageContainer>
            <div className={styles.sectionHeading}>
              <div><span className={styles.eyebrow}>E-shopy</span><h2>Hodnotenia nákupnej skúsenosti</h2></div>
              <p>Používateľ ohodnotí päť oblastí od 1 do 5. Na odoslanie stačí overený e-mail; externé hviezdičky sa do skóre Psipedia nemiešajú.</p>
            </div>
            {eshops.length ? (
              <div className={styles.eshopGrid}>
                {eshops.map((shop) => (
                  <Link className={styles.eshopCard} href={`/recenzie/eshopy/${shop.slug}`} key={shop.id}>
                    <div className={styles.eshopCardTop}>
                      <div className={styles.eshopIdentity}>
                        <span className={styles.eshopLogo}>{shop.logoUrl ? <img src={shop.logoUrl} alt="" /> : <span aria-hidden="true">🛒</span>}</span>
                        <div><span>E-shop</span><h3>{shop.name}</h3></div>
                      </div>
                      {shop.averages ? (
                        <strong aria-label={`Celkové hodnotenie ${shop.averages.overall} z 5`}>{shop.averages.overall.toLocaleString("sk-SK", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ★</strong>
                      ) : <small>Bez hodnotení</small>}
                    </div>
                    <p>{shop.description}</p>
                    {shop.focusTags.length ? <div className={styles.eshopTags}>{shop.focusTags.slice(0, 6).map((tag) => <span key={tag}>{tag}</span>)}</div> : null}
                    {shop.averages ? (
                      <dl className={styles.eshopMiniRatings}>
                        {ESHOP_RATING_FIELDS.slice(0, 4).map((field) => (
                          <div key={field.key}><dt>{field.label}</dt><dd>{shop.averages?.[field.key].toLocaleString("sk-SK", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</dd></div>
                        ))}
                      </dl>
                    ) : null}
                    <footer><span>{shop.ratingCount} {shop.ratingCount === 1 ? "hodnotenie" : "hodnotení"}</span><b>Detail a hodnotenie <ArrowIcon size={17} /></b></footer>
                  </Link>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>
                <strong>Profily e-shopov sa momentálne nepodarilo načítať.</strong>
                <p>Skúste to prosím neskôr.</p>
              </div>
            )}
          </PageContainer>
        </section>
      ) : null}

      <section className={styles.methodology}>
        <PageContainer>
          <div className={styles.sectionHeading}>
            <div><span className={styles.eyebrow}>Ako hodnotíme</span><h2>Jasné pravidlá pre testy aj používateľské recenzie</h2></div>
          </div>
          <div className={styles.methodGrid}>
            <article><strong>1</strong><h3>Kontext pred skóre</h3><p>Uvádzame veľkosť, vek, aktivitu psa a spôsob použitia, aby bol výsledok zrozumiteľný.</p></article>
            <article><strong>2</strong><h3>Transparentný obchodný vzťah</h3><p>Affiliate a sponzorovaný obsah musí byť označený. Obchodný vzťah nesmie meniť používateľské hviezdičky.</p></article>
            <article><strong>3</strong><h3>Oddelené zdroje hodnotenia</h3><p>Redakčný záver, priemer používateľov Psipedia a prípadné externé hodnotenia sú tri samostatné informácie.</p></article>
          </div>
        </PageContainer>
      </section>
      </PublicFoundation>
    </main>
  );
}
