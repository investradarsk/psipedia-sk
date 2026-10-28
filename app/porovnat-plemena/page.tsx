import type { Metadata } from "next";
import Link from "next/link";
import { BreedComparison } from "@/components/breed-comparison";
import { ArrowIcon } from "@/components/icons";
import { listPublishedBreedsForComparison } from "@/lib/breed-store";
import { buildPageMetadata } from "@/lib/seo";
import styles from "./comparison.module.css";

export const metadata: Metadata = buildPageMetadata({
  title: "Porovnanie plemien psov",
  description: "Porovnajte dve plemená psov podľa veľkosti, energie, cvičiteľnosti, rodinného života a každodenných potrieb.",
  path: "/porovnat-plemena",
});

export const dynamic = "force-dynamic";

export default async function CompareBreedsPage() {
  const breeds = await listPublishedBreedsForComparison();
  return (
    <main id="obsah" className={styles.comparisonPage}>
      <header className="page-hero page-hero--compact shell compare-page-hero">
        <div className="page-hero-inner">
          <span className="eyebrow">Porovnávač plemien</span>
          <h1>Porovnaj dve plemená psov</h1>
          <p>Porovnaj veľkosť, energiu, povahu a potreby plemien na jednom mieste.</p>
          <Link href="/plemena" className="text-link text-link--large">Atlas plemien <ArrowIcon /></Link>
        </div>
      </header>
      <section className="page-body shell">
        <BreedComparison breeds={breeds} />
      </section>
    </main>
  );
}
