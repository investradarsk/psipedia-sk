"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import {
  PublicSubcategoryNavigator,
  type PublicSubcategoryItem,
} from "@/components/public-visual-system";
import styles from "./directory-public.module.css";

/** Mobile has a labeled native list of all categories: nothing is cut off
 * horizontally and no visitor needs to discover a hidden swipe gesture.
 * Desktop continues to use the canonical SEO-friendly linked category tabs. */
export function DirectoryCategoryNavigation({ items }: { items: PublicSubcategoryItem[] }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const navId = useId();
  const selectId = useId();

  useEffect(() => {
    const track = wrapperRef.current?.querySelector<HTMLElement>("[data-public-subcategory-track]");
    if (!track) return;
    const refresh = () => setHasOverflow(expanded || track.scrollWidth > track.clientWidth + 2);
    setHydrated(true);
    refresh();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(refresh) : null;
    observer?.observe(track);
    window.addEventListener("resize", refresh);
    return () => { observer?.disconnect(); window.removeEventListener("resize", refresh); };
  }, [expanded, items]);

  const currentHref = items.find((item) => item.current)?.href ?? "";
  return (
    <div className={styles.categorySwitcherWrap} data-directory-category-navigation
      data-expanded={expanded ? "true" : "false"} ref={wrapperRef}>
      <div className={styles.categoryNavTop}>
        <label htmlFor={selectId}>Kategória služby</label>
        {hydrated && (hasOverflow || expanded) ? (
          <button type="button" className={styles.categoryMore}
            aria-expanded={expanded} aria-controls={navId}
            onClick={() => setExpanded((value) => !value)}>
            {expanded ? "Zbaliť" : "Ďalšie"}
          </button>
        ) : null}
      </div>
      <select
        id={selectId}
        className={styles.categoryMobileSelect}
        value={currentHref}
        onChange={(event) => {
          if (event.target.value) router.push(event.target.value);
        }}
        aria-label="Vyber kategóriu služby"
      >
        {!currentHref && <option value="">Vyber kategóriu</option>}
        {items.map((item) => (
          <option key={item.href} value={item.href}>
            {typeof item.title === "string" ? item.title : item.href.split("/").filter(Boolean).pop() ?? "Kategória"}
          </option>
        ))}
      </select>
      <div className={styles.categoryDesktopTabs} id={navId}>
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
