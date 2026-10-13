"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  PublicSubcategoryNavigator,
  type PublicSubcategoryItem,
} from "@/components/public-visual-system";
import styles from "./directory-public.module.css";

/** Reuses canonical category links; the extra affordance reveals the same track. */
export function DirectoryCategoryNavigation({ items }: { items: PublicSubcategoryItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(true);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const navId = useId();

  useEffect(() => {
    const track = wrapperRef.current?.querySelector<HTMLElement>("[data-public-subcategory-track]");
    if (!track) return;
    const refresh = () => setHasOverflow(track.scrollWidth > track.clientWidth + 2);
    refresh();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(refresh) : null;
    if (observer) observer.observe(track);
    window.addEventListener("resize", refresh);
    return () => { observer?.disconnect(); window.removeEventListener("resize", refresh); };
  }, [expanded, items]);

  return (
    <div
      className={styles.categorySwitcherWrap}
      data-directory-category-navigation
      data-expanded={expanded ? "true" : "false"}
      ref={wrapperRef}
    >
      <div className={styles.categoryNavTop}>
        <span>Vyber kategóriu</span>
        {hasOverflow || expanded ? (
          <button type="button" className={styles.categoryMore}
            aria-expanded={expanded} aria-controls={navId}
            onClick={() => setExpanded((value) => !value)}>
            {expanded ? "Zbaliť" : "Ďalšie"}
          </button>
        ) : null}
      </div>
      <div id={navId}>
        <PublicSubcategoryNavigator
          mode="compact"
          items={items}
          label="Prepnúť kategóriu služby"
          className={styles.categorySwitcher}
        />
      </div>
    </div>
  );
}
