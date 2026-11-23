import type { Metadata } from "next";
import Link from "next/link";
import { ArticleCard } from "@/components/article-card";
import { fciGroups } from "@/lib/content";
import { getPublishedBreedArticleArchivePage } from "@/lib/article-store";
import { buildListingPageMetadata } from "@/lib/listing-seo";
import styles from "./archive.module.css";

type Params = Record<string, string | string[] | undefined>;
type Props = { searchParams: Promise<Params> };

export const dynamic = "force-dynamic";

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function archiveHref(group: number | null, query: string, page = 1): string {
  const params = new URLSearchParams();
  if (group !== null) params.set("fciGroup", String(group));
  if (query) params.set("q", query);
  if (page > 1) params.set("strana", String(page));
  const search = params.toString();
  return `/clanky/plemena${search ? `?${search}` : ""}`;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  return buildListingPageMetadata({
    title: "Články o plemenách",
    description: "História, povaha, výcvik a život s jednotlivými plemenami. Články zoradené podľa dátumu a FCI skupín.",
    path: "/clanky/plemena",
    searchParams: await searchParams,
  });
}

export default async function BreedArticleArchive({ searchParams }: Props) {
  const params = await searchParams;
  const groupValue = first(params.fciGroup);
  const fciGroup = /^(?:[1-9]|10)$/.test(groupValue) ? Number(groupValue) : null;
  const query = first(params.q).trim().slice(0, 100);
  const pageValue = first(params.strana);
  const page = /^[1-9]\d{0,3}$/.test(pageValue) ? Number(pageValue) : 1;
  const result = await getPublishedBreedArticleArchivePage({
    fciGroup: fciGroup ?? undefined,
    query,
    page,
    pageSize: 18,
  });
  const hasPrevious = page > 1;
  const hasNext = page * result.pageSize < result.total;
  const groupLabel = fciGroup ? fciGroups.find(group => group.number === fciGroup)?.label : null;

  return (
    <main id="obsah" className={styles.page}>
      <div className={styles.shell}>
        <nav className={styles.breadcrumbs} aria-label="Navigácia">
          <Link href="/">Domov</Link><span>/</span>
          <Link href="/plemena">Plemená</Link><span>/</span>
          <span>Články o plemenách</span>
        </nav>
        <header className={styles.header}>
          <p className={styles.eyebrow}>Magazín Psipedia</p>
          <h1>Články o plemenách</h1>
          <p>História, povaha, výcvik a život s jednotlivými plemenami. Objavuj články podľa FCI skupiny.</p>
        </header>
        <form className={styles.search} action="/clanky/plemena" method="get" role="search">
          {fciGroup !== null && <input type="hidden" name="fciGroup" value={fciGroup}/>}
          <label htmlFor="breed-article-query">Hľadať medzi článkami</label>
          <div className={styles.searchControls}>
            <input id="breed-article-query" type="search" name="q" defaultValue={query}
              placeholder="Napríklad labrador alebo výcvik" maxLength={100}/>
            <button type="submit">Hľadať</button>
          </div>
        </form>
        <nav className={styles.groups} aria-label="Filtrovať články podľa FCI skupiny">
          <Link href={archiveHref(null,query)} aria-current={fciGroup === null ? "page" : undefined}
            className={fciGroup === null ? styles.active : ""}>Všetky skupiny</Link>
          {fciGroups.map(group => (
            <Link key={group.number} href={archiveHref(group.number,query)}
              aria-current={fciGroup === group.number ? "page" : undefined}
              className={fciGroup === group.number ? styles.active : ""}>
              {group.number}. {group.label}
            </Link>
          ))}
        </nav>
        <div className={styles.results}>
          <h2>{groupLabel ? `Články: ${groupLabel}` : "Najnovšie články"}</h2>
          <p>{result.total} {result.total === 1 ? "článok" : result.total > 1 && result.total < 5 ? "články" : "článkov"}</p>
        </div>
        {result.articles.length > 0 ? (
          <div className={styles.grid} role="list">
            {result.articles.map(article => (
              <div role="listitem" key={article.slug} className={styles.card}>
                <ArticleCard article={article} variant="grid" listItem={false}/>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            <p>Pre tento výber zatiaľ nemáme publikované články.</p>
            <Link href="/clanky/plemena">Zobraziť všetky články</Link>
          </div>
        )}
        {(hasPrevious || hasNext) && (
          <nav className={styles.pagination} aria-label="Stránkovanie článkov">
            {hasPrevious && <Link href={archiveHref(fciGroup,query,page-1)}>← Predchádzajúca strana</Link>}
            <span>Strana {page} z {Math.max(1,Math.ceil(result.total/result.pageSize))}</span>
            {hasNext && <Link href={archiveHref(fciGroup,query,page+1)}>Nasledujúca strana →</Link>}
          </nav>
        )}
        <Link className={styles.back} href="/plemena">← Späť do atlasu plemien</Link>
      </div>
    </main>
  );
}
