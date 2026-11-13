"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./public-subcategory-navigator.module.css";

const ITEMS_PER_PAGE = 6;

/**
 * A progressive-enhancement layer for the shared public category navigator.
 * Desktop displays every link in the normal grid. On narrow screens the exact
 * same links form swipeable two-column pages of up to six; no duplicated SEO links.
 */
export function PublicSubcategoryPagedTrack({
  pages,
  initialPage = 0,
  label,
}: {
  pages: ReactNode[];
  initialPage?: number;
  label: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const lastPage = Math.max(0, pages.length - 1);
  const [activePage, setActivePage] = useState(Math.max(0, Math.min(initialPage, lastPage)));

  useEffect(() => {
    const element = track.current;
    if (!element || !window.matchMedia("(max-width: 620px)").matches) return;
    element.scrollLeft = element.clientWidth * Math.max(0, Math.min(initialPage, lastPage));
  }, [initialPage, lastPage]);

  function jumpToPage(nextPage: number) {
    const boundedPage = Math.max(0, Math.min(lastPage, nextPage));
    setActivePage(boundedPage);
    const element = track.current;
    if (!element) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollTo({
      left: boundedPage * element.clientWidth,
      behavior: reduceMotion ? "instant" : "smooth",
    });
  }

  function updatePageFromScroll() {
    const element = track.current;
    if (!element || !element.clientWidth) return;
    setActivePage(Math.max(0, Math.min(lastPage,
      Math.round(element.scrollLeft / element.clientWidth))));
  }

  return (
    <div className={styles.pagedShell} data-public-subcategory-pager data-page-size={ITEMS_PER_PAGE}>
      <div
        className={`${styles.compactTrack} ${styles.pagedTrack}`}
        ref={track}
        onScroll={updatePageFromScroll}
        role="group"
        aria-label={label}
        data-public-subcategory-track
      >
        {pages.map((contents, index) => (
          <div className={styles.pagedPage} data-public-subcategory-page={index + 1} key={index}>
            {contents}
          </div>
        ))}
      </div>
      <div className={styles.pagedControls} aria-label={`Listovanie v kategóriách: ${label}`}>
        <button type="button" className={styles.pagedArrow} disabled={activePage === 0}
          onClick={() => jumpToPage(activePage - 1)} aria-label="Predchádzajúcich šesť kategórií">
          <span aria-hidden="true">‹</span>
        </button>
        <div className={styles.pagedDots} role="group" aria-label="Strany kategórií">
          {pages.map((_, index) => (
            <button type="button" key={index}
              className={`${styles.pagedDot} ${index === activePage ? styles.pagedDotActive : ""}`}
              aria-label={`Strana kategórií ${index + 1} z ${pages.length}`}
              aria-current={index === activePage ? "step" : undefined}
              onClick={() => jumpToPage(index)}
            >
              <span aria-hidden="true" />
            </button>
          ))}
        </div>
        <button type="button" className={styles.pagedArrow} disabled={activePage === lastPage}
          onClick={() => jumpToPage(activePage + 1)} aria-label="Ďalších šesť kategórií">
          <span aria-hidden="true">›</span>
        </button>
        <span className={styles.pagedStatus} aria-live="polite">Strana {activePage + 1} z {pages.length}</span>
      </div>
    </div>
  );
}
