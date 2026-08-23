import type { Metadata } from "next";
import Link from "next/link";
import { BreedComparison } from "@/components/breed-comparison";
import { ArrowIcon } from "@/components/icons";
import { breeds } from "@/lib/content";

export const metadata: Metadata = {
  title: "Porovnanie plemien psov",
  description: "Porovnajte dve plemená psov podľa veľkosti, energie, cvičiteľnosti, rodinného života a každodenných potrieb.",
  alternates: { canonical: "/porovnat-plemena" },
};

export default function CompareBreedsPage() {
  return (
    <main id="obsah">
      <header className="page-hero page-hero--compact shell compare-page-hero">
        <div className="page-hero-inner">
          <span className="eyebrow">Porovnávač plemien</span>
          <h1>Dve plemená. Jeden život, do ktorého musia zapadnúť.</h1>
          <p>Vyber dve plemená a pozri si ich rozdiely bok po boku. Čísla sú iba začiatok – dôležité sú aj povaha, potreby a to, čo od spoločného života očakávaš.</p>
          <Link href="/plemena" className="text-link text-link--large">Prejsť do celého atlasu <ArrowIcon /></Link>
        </div>
      </header>
      <section className="page-body shell">
        <BreedComparison breeds={breeds} />
      </section>
    </main>
  );
}
