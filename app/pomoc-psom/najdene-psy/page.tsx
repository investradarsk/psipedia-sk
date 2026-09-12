import type { Metadata } from "next";
import { LostFoundDogsPage } from "@/components/lost-found-dogs-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Nájdené psy | Psipedia",
  description: "Aktuálne hlásenia o nájdených psoch na Slovensku s filtrovaním podľa lokality, dátumu, pohlavia, veľkosti a plemena.",
  alternates: { canonical: "https://psipedia.sk/pomoc-psom/najdene-psy" },
  openGraph: { title: "Nájdené psy | Psipedia", description: "Aktuálne hlásenia o nájdených psoch na Slovensku.", url: "https://psipedia.sk/pomoc-psom/najdene-psy", type: "website" },
};
export default function FoundDogsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <LostFoundDogsPage type="FOUND" searchParams={searchParams} />;
}
