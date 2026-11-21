"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  getAvailableAffiliateOriginalBanners,
  nextAffiliateRotation,
  type AffiliateBannerPlacement,
} from "@/lib/affiliate-banner-rotation";
import styles from "./affiliate-rotating-banner.module.css";

// Rotation lives in memory only: no cookies or browser storage.
let nextBannerIndex: number | null = null;

/**
 * Renders only original merchant artwork supplied by Dognet.
 * Never substitutes a self-designed card, headline, logo or CTA.
 */
export function AffiliateRotatingBanner({
  placement = "horizontal",
}: {
  placement?: AffiliateBannerPlacement;
}) {
  const pathname = usePathname();
  const banners = getAvailableAffiliateOriginalBanners(placement);
  const [selection, setSelection] = useState<{ key: string; index: number } | null>(null);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const lastSelectionKey = useRef<string | null>(null);
  const selectionKey = `${pathname ?? ""}:${placement}`;
  const selected = selection?.key === selectionKey ? banners[selection.index] : null;
  const original = selected?.creative;
  const imageAvailable = original && failedImage !== original.src;

  useEffect(() => {
    if (!pathname || !banners.length || lastSelectionKey.current === selectionKey) return;
    lastSelectionKey.current = selectionKey;
    const initialIndex = nextBannerIndex === null
      ? Math.floor(Math.random() * banners.length)
      : nextBannerIndex;
    const rotation = nextAffiliateRotation(initialIndex, banners.length);
    nextBannerIndex = rotation.next;
    setSelection({ key: selectionKey, index: rotation.selected });
    setFailedImage(null);
  }, [pathname, selectionKey, banners.length]);

  if (!banners.length) return null;

  return (
    <aside
      aria-label="Reklama"
      className={`${styles.banner} ${placement === "sidebar" ? styles.sidebar : styles.horizontal}`}
      data-affiliate-rotating-banner={placement}
      data-affiliate-shop={imageAvailable ? selected?.id : undefined}
    >
      <span className={styles.label}>Reklama · affiliate</span>
      {selected && original && imageAvailable ? (
        <a
          className={styles.creative}
          href={selected.href}
          rel="nofollow sponsored noopener noreferrer"
          target="_blank"
          aria-label={`Reklama ${selected.name}: otvoriť obchod v novej karte`}
        >
          <img
            className={styles.image}
            src={original.src}
            alt={`Reklamný banner ${selected.name}`}
            width={original.width}
            height={original.height}
            loading="lazy"
            decoding="async"
            onError={() => setFailedImage(original.src)}
          />
        </a>
      ) : (
        <div className={styles.placeholder} aria-hidden="true" />
      )}
    </aside>
  );
}
