import type { Metadata } from "next";
import Link from "next/link";
import { AdoptionCatalog } from "@/components/adoption-catalog";
import { adoptionCatalogHasFacet, parseAdoptionCatalogFilters, type AdoptionCatalogSearchParams } from "@/lib/adoption-catalog";
import { getPublicAdoptions, listPublishedAdoptionBreedOptions } from "@/lib/adoption-store";
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
  const filters = parseAdoptionCatalogFilters(await searchParams);
  const [result, breeds] = await Promise.all([
    getPublicAdoptions(filters),
    listPublishedAdoptionBreedOptions(),
  ]);

  return <main id="obsah" tabIndex={-1} className={styles.shell}>
    <AdoptionCatalog result={result} filters={filters} breeds={breeds} />
    <p><Link href="/pomoc-psom">← Späť na Pomoc psom</Link></p>
  </main>;
}
