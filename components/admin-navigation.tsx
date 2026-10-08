"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  adminNavigationGroups,
  findActiveAdminNavigationItem,
  getAdminBreadcrumbs,
} from "@/lib/admin-navigation";
import styles from "./admin-navigation.module.css";

function NavigationGroups({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  const active = findActiveAdminNavigationItem(pathname);

  return (
    <>
      {adminNavigationGroups.map((group, groupIndex) => (
        <div className={mobile ? styles.mobileGroup : "admin-nav-group"} key={group.label}>
          <span>{group.label}</span>
          <div>
            {group.items.map((item, itemIndex) => {
              const current = active?.href === item.href;
              return (
                <Link
                  href={item.href}
                  key={item.href}
                  aria-current={current ? "page" : undefined}
                  data-admin-drawer-first={mobile && groupIndex === 0 && itemIndex === 0 ? "true" : undefined}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

function focusableElements(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
  )).filter((element) => !element.hasAttribute("hidden"));
}

export function AdminNavigation({ stickyClassName }: { stickyClassName: string }) {
  const pathname = usePathname();
  const active = findActiveAdminNavigationItem(pathname);
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;
  const desktopRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeMenus = () => {
      desktopRef.current?.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((item) => { item.open = false; });
    };
    const pointer = (event: PointerEvent) => {
      if (!desktopRef.current?.contains(event.target as Node)) closeMenus();
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const expanded = desktopRef.current?.querySelector<HTMLDetailsElement>("details[open]");
      if (!expanded) return;
      event.preventDefault();
      expanded.open = false;
      expanded.querySelector<HTMLElement>("summary")?.focus();
    };
    document.addEventListener("pointerdown", pointer);
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("pointerdown", pointer);
      document.removeEventListener("keydown", keyboard);
    };
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const firstLink = dialog?.querySelector<HTMLElement>('[data-admin-drawer-first="true"]');
    firstLink?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpenPath(null);
        requestAnimationFrame(() => triggerRef.current?.focus());
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = focusableElements(dialog);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const closeDrawer = () => {
    setOpenPath(null);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return (
    <>
      <nav ref={desktopRef} className={["admin-section-nav", styles.desktopNavigation, stickyClassName].join(" ")} aria-label="Redakčné moduly" data-admin-sticky-nav>
        {adminNavigationGroups.map((group, index) => (
          <details key={group.label} name="admin-primary" className={styles.desktopGroup}>
            <summary className={styles.groupTrigger} data-active={group.items.some((item) => item.href === active?.href) ? "true" : undefined}>
              {group.label}<span className={styles.chevron} aria-hidden="true">⌄</span>
            </summary>
            <div className={styles.desktopMenu} id={"admin-menu-" + index}>
              {group.items.map((item) => {
                const current = active?.href === item.href;
                return <Link href={item.href} key={item.href} aria-current={current ? "page" : undefined}>{item.label}</Link>;
              })}
            </div>
          </details>
        ))}
      </nav>

      <div className={`${stickyClassName} ${styles.mobileBar}`} data-admin-sticky-nav>
        <div>
          <span className={styles.mobileEyebrow}>Admin</span>
          <strong>{active?.label ?? "Pracovný prehľad"}</strong>
        </div>
        <button
          ref={triggerRef}
          type="button"
          className={styles.menuButton}
          aria-expanded={open}
          aria-controls="admin-mobile-menu"
          aria-haspopup="dialog"
          onClick={() => setOpenPath(pathname)}
        >
          Menu
        </button>
      </div>

      {open ? (
        <div className={styles.backdrop} role="presentation" onMouseDown={closeDrawer}>
          <div
            ref={dialogRef}
            id="admin-mobile-menu"
            className={styles.drawer}
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-mobile-menu-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className={styles.drawerHeader}>
              <div>
                <span>Psipedia redakcia</span>
                <h2 id="admin-mobile-menu-title">Navigácia administrácie</h2>
              </div>
              <button type="button" className={styles.closeButton} onClick={closeDrawer} aria-label="Zatvoriť admin menu">
                ×
              </button>
            </div>
            <nav className={styles.mobileNavigation} aria-label="Redakčné moduly">
              <NavigationGroups mobile />
            </nav>
            <div className={styles.mobilePublic}>
              <Link href="/adresar" target="_blank" rel="noreferrer">Služby pre psov ↗</Link>
              <Link href="/pomoc-psom" target="_blank" rel="noreferrer">Pomoc psom ↗</Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function AdminBreadcrumbs() {
  const pathname = usePathname();
  const breadcrumbs = getAdminBreadcrumbs(pathname);

  return (
    <nav className={styles.breadcrumbs} aria-label="Drobečková navigácia">
      <ol>
        {breadcrumbs.map((item) => (
          <li key={item.href}>
            {item.current
              ? <span aria-current="page">{item.label}</span>
              : <Link href={item.href}>{item.label}</Link>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
