"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type PhotoSwipeLightbox from "photoswipe/lightbox";
import "photoswipe/style.css";

/**
 * Keep gallery links in server HTML and out of the first-load JS bundle.
 * Load the lightbox controller only when the gallery nears the viewport.
 * A quick click before intersection completes still opens the lightbox after
 * its chunk loads; a failed import falls back to the original image URL.
 */
export function PublicPhotoSwipeEnhancer({ children }: { children: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const gallery = host.current;
    if (!gallery) return;

    let active = true;
    let lightbox: PhotoSwipeLightbox | null = null;
    let pending: Promise<PhotoSwipeLightbox | null> | null = null;
    const links = () => gallery.querySelectorAll<HTMLAnchorElement>('a[data-pswp-gallery-item]');

    function updateImageDimensions() {
      links().forEach((anchor) => {
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
    }

    function prepareLightbox(): Promise<PhotoSwipeLightbox | null> {
      if (lightbox) return Promise.resolve(lightbox);
      if (!pending) {
        pending = import("photoswipe/lightbox")
          .then(({ default: PhotoSwipeLightbox }) => {
            if (!active) return null;
            updateImageDimensions();
            const instance = new PhotoSwipeLightbox({
              gallery,
              children: 'a[data-pswp-gallery-item]',
              pswpModule: () => import("photoswipe"),
              padding: { top: 24, bottom: 24, left: 16, right: 16 },
            });
            instance.init();
            lightbox = instance;
            return instance;
          })
          .catch(() => null)
          .finally(() => { pending = null; });
      }
      return pending;
    }

    function onFirstClick(event: MouseEvent) {
      if (lightbox || event.defaultPrevented || event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest<HTMLAnchorElement>('a[data-pswp-gallery-item]');
      if (!anchor || !gallery.contains(anchor) || anchor.hasAttribute("download") ||
        (anchor.target && anchor.target !== "_self")) return;
      const index = Array.from(links()).indexOf(anchor);
      if (index < 0) return;
      event.preventDefault();
      void prepareLightbox().then((instance) => {
        if (!active) return;
        if (instance) instance.loadAndOpen(index);
        else window.location.assign(anchor.href);
      });
    }

    // Intercept only the first click before PhotoSwipe registers its own
    // delegated listener. After initialization its standard click handling wins.
    gallery.addEventListener("click", onFirstClick, true);
    const observer = typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver((entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          observer.disconnect();
          void prepareLightbox();
        }, { rootMargin: "600px 0px" })
      : null;
    if (observer) observer.observe(gallery);
    else void prepareLightbox();

    return () => {
      active = false;
      observer?.disconnect();
      gallery.removeEventListener("click", onFirstClick, true);
      lightbox?.destroy();
    };
  }, []);

  return <div ref={host} style={{ display: "contents" }}>{children}</div>;
}
