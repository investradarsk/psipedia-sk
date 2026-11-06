"use client";

import { useId } from "react";
import styles from "./admin-shared-editor-navigation.module.css";

export type AdminSharedEditorSectionLink = { id: string; label: string };

/**
 * Common presentation and keyboard/select behavior for Psipedia's editors.
 *
 * Section switching, document navigation and modal scrolling remain owned by
 * their caller. This component never unmounts a form or touches its save state.
 */
export function AdminSharedEditorNavigation({
  sections,
  activeId,
  onNavigate,
  layout = "horizontal",
  mode = "scroll",
  ready = true,
  ariaLabel = "Sekcie editora",
}: {
  sections: readonly AdminSharedEditorSectionLink[];
  activeId: string;
  onNavigate: (id: string) => void;
  layout?: "horizontal" | "sidebar";
  mode?: "scroll" | "switch";
  ready?: boolean;
  ariaLabel?: string;
}) {
  const selectId = useId();
  if (!sections.length) return null;
  const currentId = sections.some((item) => item.id === activeId)
    ? activeId
    : sections[0].id;

  // For one-panel-at-a-time editors, keyboard and screen-reader focus must
  // follow the newly revealed section. Never steal focus on initial hydration,
  // or on scroll/hash navigation that has its own focus/scroll semantics.
  function navigate(id: string) {
    if (!ready || !sections.some((section) => section.id === id)) return;
    onNavigate(id);
    if (mode !== "switch") return;
    window.requestAnimationFrame(() => {
      const target = document.getElementById(id);
      if (!(target instanceof HTMLElement) || !target.matches("[data-admin-editor-section]") || target.hidden) return;
      target.focus({ preventScroll: false });
    });
  }

  return (
    <nav className={layout === "sidebar" ? styles.sidebar : styles.horizontal}
      aria-label={ariaLabel} data-admin-shared-editor-navigation
      data-editor-navigation-layout={layout}
      data-editor-navigation-mode={mode} data-admin-editor-nav-ready={ready ? "true" : "false"}>
      <div className={styles.links}>
        {sections.map((item) => mode === "scroll" ? (
          <a key={item.id} href={`#${encodeURIComponent(item.id)}`}
            aria-current={currentId === item.id ? "location" : undefined}
            onClick={(event) => {
              event.preventDefault();
              onNavigate(item.id);
            }}>
            {item.label}
          </a>
        ) : (
          <button key={item.id} type="button"
            aria-current={currentId === item.id ? "step" : undefined}
            aria-controls={item.id}
            disabled={!ready}
            onClick={() => navigate(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      <label className={styles.mobile} htmlFor={selectId}>
        <span>Sekcia editora</span>
        <select id={selectId} aria-label="Sekcia editora" value={currentId}
          aria-controls={mode === "switch" ? currentId : undefined}
          disabled={!ready} onChange={(event) => navigate(event.currentTarget.value)}>
          {sections.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
    </nav>
  );
}
