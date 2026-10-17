"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Measure the actual stacked sticky controls across desktop/mobile widths. */
export function AdminStickyMetrics() {
  const pathname = usePathname();
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-admin-shell]");
    const topbar = root?.querySelector<HTMLElement>("[data-admin-topbar]");
    const navs = Array.from(root?.querySelectorAll<HTMLElement>("[data-admin-sticky-nav]") ?? []);
    const editorNav = root?.querySelector<HTMLElement>("[data-admin-editor-navigation-container], [data-admin-editor-navigation]");
    if (!root || !topbar) return;
    const update = () => {
      const nav = navs.find((element) => getComputedStyle(element).display !== "none");
      const stickyTop = Math.ceil(topbar.getBoundingClientRect().height) + 8;
      // The V3 mobile menu shares the topbar row; it does not add a second sticky row.
      const inlineMobileMenu = nav?.closest("[data-admin-sidebar-shell]") &&
        getComputedStyle(nav).position === "fixed";
      const stack = stickyTop + (nav && !inlineMobileMenu ? Math.ceil(nav.getBoundingClientRect().height) : 0) + 8;
      root.style.setProperty("--admin-sticky-top", `${stickyTop}px`);
      root.style.setProperty("--admin-sticky-stack", `${stack}px`);
      root.style.setProperty("--admin-editor-nav-height", `${editorNav ? Math.ceil(editorNav.getBoundingClientRect().height) : 0}px`);
    };
    const observer = new ResizeObserver(update);
    observer.observe(topbar);
    navs.forEach((nav) => observer.observe(nav));
    if (editorNav) observer.observe(editorNav);
    window.addEventListener("resize", update);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      root.style.removeProperty("--admin-sticky-top");
      root.style.removeProperty("--admin-sticky-stack");
      root.style.removeProperty("--admin-editor-nav-height");
    };
  }, [pathname]);
  return null;
}
