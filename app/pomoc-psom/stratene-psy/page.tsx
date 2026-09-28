import type { Metadata } from "next";
import { LostFoundDogsPage } from "@/components/lost-found-dogs-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Stratené psy | Psipedia",
  description: "Aktuálne hlásenia o stratených psoch na Slovensku s filtrovaním podľa lokality, dátumu, pohlavia, veľkosti a plemena.",
  alternates: { canonical: "https://psipedia.sk/pomoc-psom/stratene-psy" },
  openGraph: { title: "Stratené psy | Psipedia", description: "Aktuálne hlásenia o stratených psoch na Slovensku.", url: "https://psipedia.sk/pomoc-psom/stratene-psy", type: "website" },
};
export default function LostDogsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <LostFoundDogsPage type="LOST" searchParams={searchParams} />;
}
