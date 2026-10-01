"use client";

import { useEffect, useRef } from "react";
import { articleReadingProgress } from "@/lib/article-reading-progress";
import styles from "./article-detail.module.css";

export function ArticleReadingProgress() {
  const fillRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const startTarget = document.querySelector<HTMLElement>("[data-article-reading-start]");
    const endTarget = document.querySelector<HTMLElement>("[data-article-reading-end]");
    const fill = fillRef.current;
    if (!startTarget || !endTarget || !fill) return;

    let frame = 0;
    let needsMeasure = true;
    let startTop = 0;
    let endBottom = 1;

    const measure = () => {
      const scrollY = window.scrollY;
      startTop = startTarget.getBoundingClientRect().top + scrollY;
      endBottom = endTarget.getBoundingClientRect().bottom + scrollY;
      needsMeasure = false;
    };

    const update = () => {
      frame = 0;
      if (needsMeasure) measure();
      const progress = articleReadingProgress({
        scrollY: window.scrollY,
        viewportHeight: window.innerHeight,
        startTop,
        endBottom,
      });
      fill.style.setProperty("--article-reading-progress", progress.toFixed(4));
    };

    const schedule = (remeasure = false) => {
      needsMeasure ||= remeasure;
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    const onScroll = () => schedule(false);
    const onResize = () => schedule(true);

    schedule(true);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className={styles.readingProgress} data-article-reading-progress aria-hidden="true">
      <span ref={fillRef} />
    </div>
  );
}
