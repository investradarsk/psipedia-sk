"use client";

import { usePathname } from "next/navigation";
import { AffiliateRotatingBanner } from "./affiliate-rotating-banner";
import { canShowGlobalAffiliateBanner } from "@/lib/affiliate-banner-rotation";
import styles from "./sitewide-affiliate-banner.module.css";

/** Shared fallback for public and partner pages, using the existing original-ad component. */
export function SitewideAffiliateBanner() {
  const pathname = usePathname();
  if (!canShowGlobalAffiliateBanner(pathname)) return null;
  return (
    <div className={styles.wrapper} data-sitewide-affiliate-banner>
      <AffiliateRotatingBanner placement="horizontal" sitewide />
    </div>
  );
}
