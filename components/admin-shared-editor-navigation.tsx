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
            onClick={() => onNavigate(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      <label className={styles.mobile} htmlFor={selectId}>
        <span>Sekcia editora</span>
        <select id={selectId} aria-label={ariaLabel} value={currentId}
          disabled={!ready} onChange={(event) => onNavigate(event.currentTarget.value)}>
          {sections.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
    </nav>
  );
}
