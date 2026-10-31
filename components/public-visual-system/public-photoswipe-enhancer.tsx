"use client";

import { useEffect, useRef, type ReactNode } from "react";
import PhotoSwipeLightbox from "photoswipe/lightbox";
import "photoswipe/style.css";

/**
 * Progressive enhancement only: all SSR anchors still work as normal image
 * links if JavaScript does not run. PhotoSwipe core is lazy-loaded on open.
 */
export function PublicPhotoSwipeEnhancer({ children }: { children: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const gallery = host.current;
    if (!gallery) return;
    const lightbox = new PhotoSwipeLightbox({
      gallery,
      children: 'a[data-pswp-gallery-item]',
      pswpModule: () => import("photoswipe"),
      padding: { top: 24, bottom: 24, left: 16, right: 16 },
    });
    // Match the actual loaded thumbnail dimensions if known. Fallback keeps
    // a valid ratio for older/unavailable remote image thumbnails.
    gallery.querySelectorAll<HTMLAnchorElement>('a[data-pswp-gallery-item]').forEach(anchor => {
      const image = anchor.querySelector("img");
      if (!image) return;
      const update = () => {
        if (!image.naturalWidth || !image.naturalHeight) return;
        anchor.dataset.pswpWidth = String(image.naturalWidth);
        anchor.dataset.pswpHeight = String(image.naturalHeight);
      };
      if (image.complete) update();
      else image.addEventListener("load", update, { once: true });
    });
    lightbox.init();
    return () => lightbox.destroy();
  }, []);
  return <div ref={host} style={{ display: "contents" }}>{children}</div>;
}
