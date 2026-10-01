import type { Metadata } from "next";
import { LostFoundDogsPage } from "@/components/lost-found-dogs-page";
import { buildListingPageMetadata } from "@/lib/listing-seo";

export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  return buildListingPageMetadata({
    title: "Nájdené psy",
    description: "Aktuálne hlásenia o nájdených psoch na Slovensku s filtrovaním podľa lokality, dátumu, pohlavia, veľkosti a plemena.",
    path: "/pomoc-psom/najdene-psy",
    searchParams: await searchParams,
    indexPagination: true,
  });
}
export default function FoundDogsPage({ searchParams }: Props) {
  return <LostFoundDogsPage type="FOUND" searchParams={searchParams} />;
}
