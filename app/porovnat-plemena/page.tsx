import type { Metadata } from "next";
import Link from "next/link";
import { BreedComparison } from "@/components/breed-comparison";
import { UniversalPageHero } from "@/components/public-visual-system/universal-page-hero";
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
      <UniversalPageHero
        eyebrow="Porovnávač plemien"
        title="Porovnaj dve plemená psov"
        intro="Porovnaj veľkosť, energiu, povahu a potreby plemien na jednom mieste."
      />
      <div className="shell">
        <Link href="/plemena" className="text-link text-link--large">
          Atlas plemien <ArrowIcon />
        </Link>
      </div>
      <section className="page-body shell">
        <BreedComparison breeds={breeds} />
      </section>
    </main>
  );
}
