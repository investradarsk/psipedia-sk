"use client";

import { useId, useState } from "react";
import type { ArticlePopularityWindow } from "@/lib/article-popularity";
import type { ArticleDiscoveryPopularItem } from "@/lib/article-discovery";
import styles from "./article-popularity-sidebar.module.css";

const windows: Array<{ key: ArticlePopularityWindow; label: string }> = [
  { key: "24h", label: "24 hodín" },
  { key: "7d", label: "7 dní" },
];

export function ArticlePopularitySidebar({
  popularity,
  initialWindow,
}: {
  popularity: Record<ArticlePopularityWindow, ArticleDiscoveryPopularItem[]>;
  initialWindow: ArticlePopularityWindow;
}) {
  const id = useId();
  const [activeWindow, setActiveWindow] = useState<ArticlePopularityWindow>(initialWindow);
  const hasPopularity = popularity["24h"].length > 0 || popularity["7d"].length > 0;

  if (!hasPopularity) return null;

  const items = popularity[activeWindow].slice(0, 5);

  return (
    <section className={styles.popularity} aria-labelledby={`${id}-heading`}>
      <div className={styles.header}>
        <h2 id={`${id}-heading`}>Najčítanejšie</h2>
        <div className={styles.tabs} role="tablist" aria-label="Obdobie rebríčka">
          {windows.map((window) => {
            const selected = activeWindow === window.key;
            return (
              <button
                key={window.key}
                id={`${id}-tab-${window.key}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`${id}-panel`}
                tabIndex={selected ? 0 : -1}
                className={selected ? styles.activeTab : undefined}
                onClick={() => setActiveWindow(window.key)}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                  event.preventDefault();
                  const nextWindow = activeWindow === "24h" ? "7d" : "24h";
                  setActiveWindow(nextWindow);
                  requestAnimationFrame(() => {
                    document.getElementById(`${id}-tab-${nextWindow}`)?.focus();
                  });
                }}
              >
                {window.label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-${activeWindow}`}
        data-popularity-window={activeWindow}
      >
        {items.length > 0 ? (
          <ol className={styles.list}>
            {items.map((item, index) => (
              <li key={item.slug}>
                <span className={styles.rank} aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <a href={item.href}>
                  <strong>{item.title}</strong>
                  <small>{item.label}</small>
                </a>
              </li>
            ))}
          </ol>
        ) : (
          <p className={styles.empty}>Za toto obdobie zatiaľ nemáme rebríček.</p>
        )}
      </div>
    </section>
  );
}
