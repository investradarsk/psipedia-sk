"use client";
import { useEffect } from "react";

/** Measure the actual stacked sticky controls across desktop/mobile widths. */
export function AdminStickyMetrics() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-admin-shell]");
    const topbar = root?.querySelector<HTMLElement>("[data-admin-topbar]");
    const navs = Array.from(root?.querySelectorAll<HTMLElement>("[data-admin-sticky-nav]") ?? []);
    if (!root || !topbar) return;
    const update = () => {
      const nav = navs.find((element) => getComputedStyle(element).display !== "none");
      const stickyTop = Math.ceil(topbar.getBoundingClientRect().height) + 8;
      const stack = stickyTop + (nav ? Math.ceil(nav.getBoundingClientRect().height) : 0) + 8;
      root.style.setProperty("--admin-sticky-top", `${stickyTop}px`);
      root.style.setProperty("--admin-sticky-stack", `${stack}px`);
    };
    const observer = new ResizeObserver(update);
    observer.observe(topbar);
    navs.forEach((nav) => observer.observe(nav));
    window.addEventListener("resize", update);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      root.style.removeProperty("--admin-sticky-top");
      root.style.removeProperty("--admin-sticky-stack");
    };
  }, []);
  return null;
}
