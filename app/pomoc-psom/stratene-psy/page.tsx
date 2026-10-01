import type { Metadata } from "next";
import { LostFoundDogsPage } from "@/components/lost-found-dogs-page";
import { buildListingPageMetadata } from "@/lib/listing-seo";

export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  return buildListingPageMetadata({
    title: "Stratené psy",
    description: "Aktuálne hlásenia o stratených psoch na Slovensku s filtrovaním podľa lokality, dátumu, pohlavia, veľkosti a plemena.",
    path: "/pomoc-psom/stratene-psy",
    searchParams: await searchParams,
    indexPagination: true,
  });
}
export default function LostDogsPage({ searchParams }: Props) {
  return <LostFoundDogsPage type="LOST" searchParams={searchParams} />;
}
