"use client";

import { useEffect, useRef, useState } from "react";
import { SectionTabs } from "@/components/page-system";
import styles from "./breed-section-nav.module.css";

export type BreedSectionNavItem = {
  id: string;
  label: string;
};

export function BreedSectionNav({ items }: { items: BreedSectionNavItem[] }) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");
  // Anchor navigation is authoritative until the visitor scrolls deliberately.
  // Otherwise delayed IntersectionObserver callbacks can overwrite the clicked
  // tab during smooth scrolling (especially on mobile).
  const anchorLock = useRef<string | null>(null);

  useEffect(() => {
    if (!items.length) return;

    const itemIds = new Set(items.map((item) => item.id));
    const syncHash = () => {
      const id = window.location.hash.replace(/^#/, "");
      if (itemIds.has(id)) {
        anchorLock.current = id;
        setActiveId(id);
      }
    };
    syncHash();
    window.addEventListener("hashchange", syncHash);

    const releaseAnchorLock = () => {
      anchorLock.current = null;
    };
    const releaseOnScrollKey = (event: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) {
        const target = event.target;
        if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
        releaseAnchorLock();
      }
    };
    window.addEventListener("wheel", releaseAnchorLock, { passive: true });
    window.addEventListener("touchmove", releaseAnchorLock, { passive: true });
    window.addEventListener("keydown", releaseOnScrollKey);

    const sections = items
      .map((item) => document.getElementById(item.id))
      .filter((section): section is HTMLElement => Boolean(section));

    const observer = new IntersectionObserver(
      (entries) => {
        if (anchorLock.current) return;
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((first, second) => second.intersectionRatio - first.intersectionRatio || first.boundingClientRect.top - second.boundingClientRect.top);
        const next = visible[0]?.target.id;
        if (next) setActiveId(next);
      },
      {
        rootMargin: "-132px 0px -58% 0px",
        threshold: [0, 0.01, 0.2, 0.5],
      },
    );

    sections.forEach((section) => observer.observe(section));
    return () => {
      window.removeEventListener("hashchange", syncHash);
      window.removeEventListener("wheel", releaseAnchorLock);
      window.removeEventListener("touchmove", releaseAnchorLock);
      window.removeEventListener("keydown", releaseOnScrollKey);
      observer.disconnect();
    };
  }, [items]);

  if (!items.length) return null;

  return (
    <SectionTabs label="Navigácia v profile plemena" className={styles.nav}>
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <a
            className={`section-tab${active ? " is-active" : ""}`}
            href={`#${item.id}`}
            onClick={() => {
              anchorLock.current = item.id;
              setActiveId(item.id);
            }}
            aria-current={active ? "location" : undefined}
            key={item.id}
          >
            {item.label}
          </a>
        );
      })}
    </SectionTabs>
  );
}
