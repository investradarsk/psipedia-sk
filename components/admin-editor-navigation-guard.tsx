"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { ADMIN_NAVIGATION_INTENT_EVENT, isEditorExit, type AdminNavigationIntent } from "@/lib/admin-editor-navigation";

/**
 * One navigation gate shared by all Admin editors. This hook does not require
 * a router context (the directory editor also runs in Gemini modal previews).
 * It never writes form state, pushes fake history, or calls an API.
 */
type NavigationHandle = EventTarget & {
  traverseTo?: (key: string) => Promise<unknown>;
  navigate?: (url: string, options?: { history?: "push" | "replace" }) => void;
};
type NavigationWindow = Window & { navigation?: NavigationHandle };
type NavigationEventLike = Event & {
  destination?: { url: string; key?: string };
  navigationType?: string;
  hashChange?: boolean;
};

let mountedDirtyGuardCount = 0;

export function useAdminEditorNavigationGuard({
  dirty,
  allowNativeExitRef: suppliedAllowNativeExitRef,
}: {
  dirty: boolean;
  allowNativeExitRef?: RefObject<boolean>;
}) {
  const ownAllowRef = useRef(false);
  const allowNativeExitRef = suppliedAllowNativeExitRef ?? ownAllowRef;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const pendingRef = useRef<(() => void) | null>(null);
  const bypassTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replayingRef = useRef(false);

  const requestNavigation = useCallback((navigate: () => void) => {
    if (allowNativeExitRef.current) { navigate(); return; }
    pendingRef.current = navigate;
    setConfirmOpen(true);
  }, [allowNativeExitRef]);

  const stay = useCallback(() => {
    pendingRef.current = null;
    setConfirmOpen(false);
  }, []);

  const allowExitForNextNavigation = useCallback(() => {
    if (bypassTimerRef.current) clearTimeout(bypassTimerRef.current);
    allowNativeExitRef.current = true;
    // If a router request is rejected, the form stays dirty and protection
    // returns automatically rather than becoming permanently disabled.
    bypassTimerRef.current = setTimeout(() => {
      allowNativeExitRef.current = false;
      bypassTimerRef.current = null;
    }, 2_000);
  }, [allowNativeExitRef]);

  const discard = useCallback(() => {
    const navigate = pendingRef.current;
    pendingRef.current = null;
    setConfirmOpen(false);
    if (!navigate) return;
    allowExitForNextNavigation();
    try {
      replayingRef.current = true;
      navigate();
    } finally {
      replayingRef.current = false;
    }
  }, [allowExitForNextNavigation]);

  useEffect(() => () => {
    if (bypassTimerRef.current) clearTimeout(bypassTimerRef.current);
  }, []);

  useEffect(() => {
    if (!dirty) return;

    // The iOS document fallback is mounted in a parent layout and may receive
    // the capture click before this editor does. A shared marker makes it defer
    // to the unsaved-change confirmation regardless of registration order.
    mountedDirtyGuardCount++;
    document.documentElement.setAttribute("data-admin-unsaved-editor", "true");

    // Document capture runs before the mobile drawer and Next Link callbacks.
    const onClick = (event: MouseEvent) => {
      if (allowNativeExitRef.current || replayingRef.current ||
        event.defaultPrevented || event.button !== 0 ||
        event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      const target = event.target;
      const anchor = target instanceof Element ? target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || anchor.hasAttribute("download") ||
        (anchor.target && anchor.target !== "_self") ||
        !isEditorExit(anchor.href, window.location.href)) return;

      event.preventDefault();
      event.stopPropagation();
      // Replay the real Link after explicit user confirmation: retain Next's
      // history behavior, route cache and the link's original query/hash.
      requestNavigation(() => anchor.click());
    };

    const navigationApi = (window as NavigationWindow).navigation;
    const onNativeNavigate = (event: Event) => {
      if (allowNativeExitRef.current || !event.cancelable) return;
      const navEvent = event as NavigationEventLike;
      if (navEvent.hashChange || !navEvent.destination?.url ||
        !isEditorExit(navEvent.destination.url, window.location.href)) return;

      const key = navEvent.destination.key;
      // A traversal without a stable destination key cannot be replayed
      // correctly (back() might turn a Forward action into Back).
      if (navEvent.navigationType === "traverse" && (!key || !navigationApi?.traverseTo)) return;

      event.preventDefault();
      const href = navEvent.destination.url;
      requestNavigation(() => {
        if (navEvent.navigationType === "traverse" && key) {
          void navigationApi?.traverseTo?.(key);
        } else if (navigationApi?.navigate) {
          navigationApi.navigate(href, { history: navEvent.navigationType === "replace" ? "replace" : "push" });
        } else if (navEvent.navigationType === "replace") {
          window.location.replace(href);
        } else {
          window.location.assign(href);
        }
      });
    };

    // Ctrl+K is button-based, not a DOM anchor. The navigation owner provides
    // its original callback so we never replace it with an unguarded hard reload.
    const onIntent = (event: Event) => {
      if (allowNativeExitRef.current || !event.cancelable) return;
      const detail = (event as CustomEvent<AdminNavigationIntent>).detail;
      if (!detail || typeof detail.navigate !== "function" ||
        typeof detail.href !== "string" ||
        !isEditorExit(detail.href, window.location.href)) return;
      event.preventDefault();
      requestNavigation(detail.navigate);
    };

    document.addEventListener("click", onClick, true);
    navigationApi?.addEventListener("navigate", onNativeNavigate);
    window.addEventListener(ADMIN_NAVIGATION_INTENT_EVENT, onIntent);
    return () => {
      document.removeEventListener("click", onClick, true);
      navigationApi?.removeEventListener("navigate", onNativeNavigate);
      window.removeEventListener(ADMIN_NAVIGATION_INTENT_EVENT, onIntent);
      mountedDirtyGuardCount--;
      if (mountedDirtyGuardCount === 0) {
        document.documentElement.removeAttribute("data-admin-unsaved-editor");
      }
    };
  }, [dirty, allowNativeExitRef, requestNavigation]);

  return {
    confirmOpen,
    allowNativeExitRef,
    requestNavigation,
    stay,
    discard,
    allowExitForNextNavigation,
  };
}
