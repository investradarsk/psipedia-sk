"use client";

import { useEffect, useState } from "react";
import { SectionTabs } from "@/components/page-system";
import styles from "./breed-section-nav.module.css";

export type BreedSectionNavItem = {
  id: string;
  label: string;
};

export function BreedSectionNav({ items }: { items: BreedSectionNavItem[] }) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");

  useEffect(() => {
    if (!items.length) return;

    const itemIds = new Set(items.map((item) => item.id));
    const syncHash = () => {
      const id = window.location.hash.replace(/^#/, "");
      if (itemIds.has(id)) setActiveId(id);
    };
    syncHash();
    window.addEventListener("hashchange", syncHash);

    const sections = items
      .map((item) => document.getElementById(item.id))
      .filter((section): section is HTMLElement => Boolean(section));

    const observer = new IntersectionObserver(
      (entries) => {
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
