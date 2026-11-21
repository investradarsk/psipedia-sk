"use client";

import { usePathname } from "next/navigation";
import { AffiliateRotatingBanner } from "./affiliate-rotating-banner";
import { canShowGlobalAffiliateBanner } from "@/lib/affiliate-banner-rotation";
import styles from "./sitewide-affiliate-banner.module.css";

/** A single footer-ad placement across public editorial and directory pages. */
export function SitewideAffiliateBanner() {
  const pathname = usePathname();
  if (!canShowGlobalAffiliateBanner(pathname)) return null;
  return (
    <div className={styles.wrapper} data-sitewide-affiliate-banner>
      <AffiliateRotatingBanner placement="horizontal" />
    </div>
  );
}
