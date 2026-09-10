"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { navigationProgress } from "@/lib/navigation-progress";

export function NavigationProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const active = useSyncExternalStore(navigationProgress.subscribe, navigationProgress.snapshot, () => false);

  useEffect(() => {
    window.dispatchEvent(new Event("psipedia:route-committed"));
  }, [pathname, search]);

  return <div className="navigation-progress" data-active={active ? "true" : "false"} aria-hidden="true"><span /></div>;
}
