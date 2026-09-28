import type { Metadata } from "next";
import Link from "next/link";
import { AdoptionCatalog } from "@/components/adoption-catalog";
import { StructuredData } from "@/components/structured-data";
import { adoptionCatalogHasFacet, parseAdoptionCatalogFilters, type AdoptionCatalogSearchParams } from "@/lib/adoption-catalog";
import { getPublicAdoptions, listPublishedAdoptionBreedOptions } from "@/lib/adoption-store";
import { buildCollectionPageJsonLd } from "@/lib/listing-seo";
import { buildPageMetadata } from "@/lib/seo";
import styles from "@/components/adoption.module.css";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<AdoptionCatalogSearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  return buildPageMetadata({
    title: "Psy na adopciu",
    description: "Aktuálny katalóg psov na adopciu na Slovensku s vyhľadávaním podľa plemena, veku, pohlavia, veľkosti a lokality.",
    path: "/pomoc-psom/adopcia",
    robots: adoptionCatalogHasFacet(params) ? { index: false, follow: true } : undefined,
  });
}

export default async function AdoptionPage({ searchParams }: Props) {
  const params = await searchParams;
  const filters = parseAdoptionCatalogFilters(params);
  const [result, breeds] = await Promise.all([
    getPublicAdoptions(filters),
    listPublishedAdoptionBreedOptions(),
  ]);
  const hasQuery = Object.values(params).some((value) => Array.isArray(value) ? value.some(Boolean) : Boolean(value));
  const schema = hasQuery ? null : buildCollectionPageJsonLd({
    name: "Psy na adopciu",
    description: "Aktuálny katalóg psov na adopciu na Slovensku s vyhľadávaním podľa plemena, veku, pohlavia, veľkosti a lokality.",
    path: "/pomoc-psom/adopcia",
    breadcrumbs: [
      { name: "Domov", path: "/" },
      { name: "Pomoc psom", path: "/pomoc-psom" },
      { name: "Psy na adopciu", path: "/pomoc-psom/adopcia" },
    ],
    items: result.items.map((dog) => ({ name: dog.name, path: `/pomoc-psom/adopcia/${dog.slug}` })),
  });

  return <>
    {schema && <StructuredData value={schema} />}
    <main id="obsah" tabIndex={-1} className={styles.shell}>
      <AdoptionCatalog result={result} filters={filters} breeds={breeds} />
      <p><Link href="/pomoc-psom">← Späť na Pomoc psom</Link></p>
    </main>
  </>;
}
