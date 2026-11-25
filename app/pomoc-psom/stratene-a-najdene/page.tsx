import type { Metadata } from "next";
import { LostFoundDogsPage } from "@/components/lost-found-dogs-page";
import { buildListingPageMetadata } from "@/lib/listing-seo";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  return buildListingPageMetadata({
    title: "Stratené a nájdené psy",
    description:
      "Aktuálne hlásenia o stratených a nájdených psoch na Slovensku s filtrovaním podľa lokality, dátumu, pohlavia, veľkosti a plemena.",
    path: "/pomoc-psom/stratene-a-najdene",
    searchParams: await searchParams,
    indexPagination: true,
  });
}

export default function LostFoundHubPage({ searchParams }: Props) {
  return <LostFoundDogsPage type="all" searchParams={searchParams} />;
}
