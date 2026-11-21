"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  AFFILIATE_BANNER_PARTNERS,
  nextAffiliateRotation,
  type AffiliateBannerPlacement,
} from "@/lib/affiliate-banner-rotation";
import styles from "./affiliate-rotating-banner.module.css";

const ROTATION_KEY = "psipedia-affiliate-banner-next-v1";

/**
 * Rotates one merchant per placement/page load. Does not animate or switch while
 * a visitor reads: this avoids distraction, interrupted clicks and extra requests.
 * Layout space is reserved before hydration to avoid shifting page content.
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

    let index = 0;
    try {
      const saved = window.sessionStorage.getItem(ROTATION_KEY);
      const number = saved === null ? null : Number(saved);
      const rotation = nextAffiliateRotation(number);
      index = rotation.selected;
      window.sessionStorage.setItem(ROTATION_KEY, String(rotation.next));
    } catch {
      // Even with storage disabled, rotate on a new page view.
      index = Math.floor(Math.random() * AFFILIATE_BANNER_PARTNERS.length);
    }
    setSelection({ key: selectionKey, index });
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
