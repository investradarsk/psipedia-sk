"use client";

import { usePathname } from "next/navigation";
import { AffiliateRotatingBanner } from "./affiliate-rotating-banner";
import { canShowGlobalAffiliateBanner } from "@/lib/affiliate-banner-rotation";
import styles from "./sitewide-affiliate-banner.module.css";

/** Shared fallback for public and partner pages, using the existing original-ad component. */
export function SitewideAffiliateBanner() {
  const pathname = usePathname();
  if (!canShowGlobalAffiliateBanner(pathname)) return null;
  // Full-width map and partner workspaces keep their normal horizontal fallback.
  const allowRightRail = pathname != null && !/^\/(?:mapa|partner)(?:\/|$)/.test(pathname);
  return (
    <>
      {allowRightRail ? (
        <div className={styles.rail} data-sitewide-affiliate-banner data-sitewide-affiliate-rail>
          <AffiliateRotatingBanner placement="sidebar" sitewide />
        </div>
      ) : null}
      <div className={styles.wrapper} data-sitewide-affiliate-banner>
        <AffiliateRotatingBanner placement="horizontal" sitewide />
      </div>
    </>
  );
}
