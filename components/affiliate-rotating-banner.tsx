"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  AFFILIATE_BANNER_PARTNERS,
  nextAffiliateRotation,
  type AffiliateBannerPlacement,
} from "@/lib/affiliate-banner-rotation";
import styles from "./affiliate-rotating-banner.module.css";

// Memory-only rotation: no cookies, browser storage or third-party requests.
let nextBannerIndex: number | null = null;

/**
 * Rotates one merchant per placement/page load. Does not animate or switch while
 * a visitor reads: this avoids distraction, interrupted clicks and extra requests.
 * Layout space is reserved before hydration to avoid shifting page content.
 * Rotation counter exists only in page memory; there is no client storage.
 */
export function AffiliateRotatingBanner({
  placement = "horizontal",
}: {
  placement?: AffiliateBannerPlacement;
}) {
  const pathname = usePathname();
  const [selection, setSelection] = useState<{ key: string; index: number } | null>(null);
  const lastSelectionKey = useRef<string | null>(null);
  const selectionKey = `${pathname ?? ""}:${placement}`;
  const partner = selection?.key === selectionKey
    ? AFFILIATE_BANNER_PARTNERS[selection.index]
    : null;

  useEffect(() => {
    if (!pathname || lastSelectionKey.current === selectionKey) return;
    lastSelectionKey.current = selectionKey;

    const initialIndex = nextBannerIndex === null
      ? Math.floor(Math.random() * AFFILIATE_BANNER_PARTNERS.length)
      : nextBannerIndex;
    const rotation = nextAffiliateRotation(initialIndex);
    nextBannerIndex = rotation.next;
    setSelection({ key: selectionKey, index: rotation.selected });
  }, [pathname, selectionKey]);

  return (
    <aside
      aria-label="Reklama"
      className={`${styles.banner} ${placement === "sidebar" ? styles.sidebar : styles.horizontal}`}
      data-affiliate-rotating-banner={placement}
      data-affiliate-shop={partner?.id}
    >
      <span className={styles.label}>Reklama · affiliate</span>
      {partner ? (
        <a
          className={styles.creative}
          href={partner.href}
          rel="nofollow sponsored noopener noreferrer"
          target="_blank"
          aria-label={`Reklama ${partner.name}: otvoriť obchod v novej karte`}
        >
          <span className={styles.message}>
            <span className={styles.shop}>{partner.name}</span>
            <strong className={styles.title}>{partner.title}</strong>
            <span className={styles.description}>{partner.description}</span>
          </span>
          <span className={styles.cta} aria-hidden="true">Pozrieť obchod</span>
        </a>
      ) : (
        <div className={styles.placeholder} aria-hidden="true" />
      )}
    </aside>
  );
}
