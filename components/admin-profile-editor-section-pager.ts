"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

// Keep SSR form inputs inactive until React can actually persist their changes.
// Unlike a client-side useEffect flag this has a stable hydration snapshot.
const subscribeHydration = () => () => {};
const clientHydration = () => true;
const serverHydration = () => false;

export function useProfileEditorHydrated() {
  return useSyncExternalStore(subscribeHydration, clientHydration, serverHydration);
}

/**
 * Focus management for the in-form Previous/Next pager in profile editors.
 * All sections stay mounted: changing the active section never resets draft state.
 * The sidebar/mobile selector already handles its own focus in
 * AdminSharedEditorNavigation, so only pager clicks use this helper.
 */
export function useProfileEditorSectionPager(
  activeSectionId: string,
  setActiveSectionId: (id: string) => void,
) {
  const requestedFocusRef = useRef<string | null>(null);

  useEffect(() => {
    if (requestedFocusRef.current !== activeSectionId) return;
    requestedFocusRef.current = null;

    // React must reveal the new section before it receives keyboard focus.
    const frame = window.requestAnimationFrame(() => {
      const panel = document.getElementById(activeSectionId);
      if (!(panel instanceof HTMLElement) ||
          !panel.matches("[data-admin-editor-section]") ||
          panel.hidden) return;
      panel.focus({ preventScroll: true });
      panel.scrollIntoView({
        block: "start",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeSectionId]);

  return (id: string) => {
    if (!id || id === activeSectionId) return;
    requestedFocusRef.current = id;
    setActiveSectionId(id);
  };
}
