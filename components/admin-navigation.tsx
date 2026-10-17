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
  const [expandedDesktopGroup, setExpandedDesktopGroup] = useState<string | null>(null);
  const groupGlyphs = ["⌂", "▤", "♧", "⚙", "◎", "◇", "⚙"];

  return (
    <>
      {adminNavigationGroups.map((group, groupIndex) => {
        const groupActive = group.items.some((item) => item.href === active?.href);
        const expanded = mobile || (expandedDesktopGroup === group.label || (expandedDesktopGroup === null && groupActive));
        return (
        <div className={mobile ? styles.mobileGroup : styles.desktopGroup} key={group.label} data-admin-nav-group={group.label}>
          {mobile ? (
            <span>{group.label}</span>
          ) : (
            <button
              type="button"
              className={styles.groupButton}
              aria-expanded={expanded}
              aria-controls={`admin-group-${groupIndex}`}
              data-active={groupActive ? "true" : undefined}
              onClick={() => setExpandedDesktopGroup(expanded ? "" : group.label)}
            >
              <span className={styles.groupGlyph} aria-hidden="true">{groupGlyphs[groupIndex]}</span>
              <span>{group.label}</span>
              <span className={styles.groupChevron} aria-hidden="true">{expanded ? "⌃" : "⌄"}</span>
            </button>
          )}
          <div id={mobile ? undefined : `admin-group-${groupIndex}`} hidden={!expanded}>
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
      );})}
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
    const nav = desktopRef.current;
    const current = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !current || getComputedStyle(nav).display === "none") return;
    const viewport = nav.getBoundingClientRect();
    const item = current.getBoundingClientRect();
    if (item.bottom > viewport.bottom) nav.scrollTop += item.bottom - viewport.bottom + 12;
    else if (item.top < viewport.top) nav.scrollTop += item.top - viewport.top - 12;
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
      <nav ref={desktopRef} className={["admin-section-nav", styles.desktopNavigation, stickyClassName].join(" ")} aria-label="Redakčné moduly" data-admin-sidebar>
        <NavigationGroups />
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
          aria-label="Menu"
          aria-expanded={open}
          aria-controls="admin-mobile-menu"
          aria-haspopup="dialog"
          onClick={() => setOpenPath(pathname)}
        >
          <span aria-hidden="true">☰</span>
          <span className={styles.menuText}>Menu</span>
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
