import type { Metadata } from "next";
import { LostFoundDogsPage } from "@/components/lost-found-dogs-page";
import { buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = buildPageMetadata({
  title: "Nájdené psy",
  description: "Aktuálne hlásenia o nájdených psoch na Slovensku s filtrovaním podľa lokality, dátumu, pohlavia, veľkosti a plemena.",
  path: "/pomoc-psom/najdene-psy",
});
export default function FoundDogsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <LostFoundDogsPage type="FOUND" searchParams={searchParams} />;
}
