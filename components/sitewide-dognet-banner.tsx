"use client";

import { usePathname } from "next/navigation";
import { DognetTestBanner } from "./dognet-test-banner";
import { shouldShowSitewideDognetBanner } from "@/lib/dognet-banner-visibility";
import styles from "./sitewide-dognet-banner.module.css";

/**
 * One quiet fallback placement on every public content route.
 * Existing in-article and homepage placements remain unchanged.
 */
export function SitewideDognetBanner() {
  const pathname = usePathname();
  if (!shouldShowSitewideDognetBanner(pathname)) return null;

  return (
    <div className={styles.placement} data-sitewide-dognet-banner>
      <DognetTestBanner format="horizontal" />
    </div>
  );
}
