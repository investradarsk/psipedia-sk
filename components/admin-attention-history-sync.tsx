"use client";

import { useEffect } from "react";

function currentCursor() {
  return new URL(window.location.href).searchParams.get("cursor") ?? "";
}

export function AdminAttentionHistorySync({ cursor }: { cursor: string }) {
  useEffect(() => {
    const syncIfStale = () => {
      if (window.location.pathname !== "/admin/operations") return;
      if (currentCursor() === cursor) return;
      window.location.reload();
    };

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) syncIfStale();
    };

    window.addEventListener("popstate", syncIfStale);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("popstate", syncIfStale);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [cursor]);

  return null;
}
