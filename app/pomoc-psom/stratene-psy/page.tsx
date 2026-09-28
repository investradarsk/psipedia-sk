import type { Metadata } from "next";
import { LostFoundDogsPage } from "@/components/lost-found-dogs-page";
import { buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = buildPageMetadata({
  title: "Stratené psy",
  description: "Aktuálne hlásenia o stratených psoch na Slovensku s filtrovaním podľa lokality, dátumu, pohlavia, veľkosti a plemena.",
  path: "/pomoc-psom/stratene-psy",
});
export default function LostDogsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <LostFoundDogsPage type="LOST" searchParams={searchParams} />;
}
