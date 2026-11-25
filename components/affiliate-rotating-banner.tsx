"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  getAvailableAffiliateOriginalBanners,
  nextAffiliateRotation,
  type AffiliateBannerFormat,
  type AffiliateBannerPlacement,
} from "@/lib/affiliate-banner-rotation";
import styles from "./affiliate-rotating-banner.module.css";

// Rotation lives in memory only: no cookies or browser storage.
const nextBannerIndexBySlot = new Map<string, number>();

/**
 * Renders only original merchant artwork supplied by Dognet.
 * Horizontal slots rotate original artwork on desktop and use square artwork on phones.
 * Sidebar slots keep tall artwork. Original image aspect ratios are preserved.
 */
export function AffiliateRotatingBanner({
  placement = "horizontal",
  sitewide = false,
}: {
  placement?: AffiliateBannerPlacement;
  sitewide?: boolean;
}) {
  const pathname = usePathname();
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  const [selection, setSelection] = useState<{ key: string; index: number } | null>(null);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const [loadedImage, setLoadedImage] = useState<string | null>(null);
  const lastSelectionKey = useRef<string | null>(null);

  useEffect(() => {
    if (placement !== "horizontal") return;
    const media = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobile(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [placement]);

  const format: AffiliateBannerFormat | null = placement === "sidebar"
    ? "sidebar"
    : isMobile === null
      ? null
      : isMobile
        ? "mobile"
        : "adaptive";
  const banners = format ? getAvailableAffiliateOriginalBanners(format) : [];
  const slotKey = `${sitewide ? "sitewide" : placement}:${format ?? placement}`;
  const selectionKey = `${pathname ?? ""}:${slotKey}`;
  const selected = selection?.key === selectionKey ? banners[selection.index] : null;
  const original = selected?.creative;
  const imageLoaded = Boolean(original && loadedImage === original.src);

  useEffect(() => {
    if (!pathname || !format || !banners.length || lastSelectionKey.current === selectionKey) return;
    lastSelectionKey.current = selectionKey;
    const initialIndex = nextBannerIndexBySlot.get(slotKey) ?? Math.floor(Math.random() * banners.length);
    const rotation = nextAffiliateRotation(initialIndex, banners.length);
    nextBannerIndexBySlot.set(slotKey, rotation.next);
    setSelection({ key: selectionKey, index: rotation.selected });
    setFailedImage(null);
  }, [pathname, format, selectionKey, slotKey, banners.length]);

  // Never display a blank ad frame or an affiliate label without a real image.
  // Image decoding and CSP/network errors must not leave empty promotional UI.
  if (!selected || !original || failedImage === original.src) return null;

  return (
    <aside
      aria-label="Reklama"
      className={`${styles.banner} ${placement === "sidebar" ? styles.sidebar : styles.horizontal} ${imageLoaded ? "" : styles.pending}`}
      data-affiliate-rotating-banner={placement}
      data-affiliate-shop={imageLoaded ? selected.id : undefined}
    >
      <span className={styles.label}>Reklama · affiliate</span>
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
            referrerPolicy="no-referrer"
            loading="lazy"
            decoding="async"
            onLoad={() => setLoadedImage(original.src)}
            onError={() => setFailedImage(original.src)}
          />
        </a>
    </aside>
  );
}
