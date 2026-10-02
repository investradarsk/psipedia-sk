import type { Metadata } from "next";
import Link from "next/link";
import { AdoptionCatalog } from "@/components/adoption-catalog";
import { StructuredData } from "@/components/structured-data";
import { PageContainer } from "@/components/page-system";
import { parseAdoptionCatalogFilters, type AdoptionCatalogSearchParams } from "@/lib/adoption-catalog";
import { getPublicAdoptions, listPublishedAdoptionBreedOptions } from "@/lib/adoption-store";
import { buildCollectionPageJsonLd, buildListingPageMetadata, resolveListingIndexPolicy } from "@/lib/listing-seo";
import styles from "@/components/adoption.module.css";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<AdoptionCatalogSearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  return buildListingPageMetadata({
    title: "Psy na adopciu",
    description: "Aktuálny katalóg psov na adopciu na Slovensku s vyhľadávaním podľa plemena, veku, pohlavia, veľkosti a lokality.",
    path: "/pomoc-psom/adopcia",
    searchParams: params,
    indexPagination: true,
    paginationParam: "strana",
  });
}

export default async function AdoptionPage({ searchParams }: Props) {
  const params = await searchParams;
  const filters = parseAdoptionCatalogFilters(params);
  const [result, breeds] = await Promise.all([
    getPublicAdoptions(filters),
    listPublishedAdoptionBreedOptions(),
  ]);
  const policy = resolveListingIndexPolicy("/pomoc-psom/adopcia", params, { indexPagination: true, paginationParam: "strana" });
  const schema = policy.kind === "query" ? null : buildCollectionPageJsonLd({
    name: "Psy na adopciu",
    description: "Aktuálny katalóg psov na adopciu na Slovensku s vyhľadávaním podľa plemena, veku, pohlavia, veľkosti a lokality.",
    path: policy.canonicalPath,
    breadcrumbs: [
      { name: "Domov", path: "/" },
      { name: "Pomoc psom", path: "/pomoc-psom" },
      { name: "Psy na adopciu", path: "/pomoc-psom/adopcia" },
    ],
    items: result.items.map((dog) => ({ name: dog.name, path: `/pomoc-psom/adopcia/${dog.slug}` })),
  });

  return <>
    {schema && <StructuredData value={schema} />}
    <main id="obsah" tabIndex={-1}>
      <PageContainer className={styles.listingShell}>
        <AdoptionCatalog result={result} filters={filters} breeds={breeds} />
        <p><Link href="/pomoc-psom">← Späť na Pomoc psom</Link></p>
      </PageContainer>
    </main>
  </>;
}
