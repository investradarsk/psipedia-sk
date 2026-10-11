"use client";

import Link from "next/link";
import { FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { NavigationItem } from "@/lib/navigation";
import { portalSections } from "@/lib/portal";
import { BookmarkIcon, ChevronDownIcon, CloseIcon, MenuIcon, PawMark, SearchIcon } from "./icons";
import { STORAGE_KEY } from "./favorite-button";
import { NavigationProgress } from "./navigation-progress";
import styles from "./site-header.module.css";

function isPathActive(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

export function SiteHeader({
  navigationItems,
  partnerAuthenticated,
}: {
  navigationItems: NavigationItem[];
  partnerAuthenticated: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [openDesktopMenu, setOpenDesktopMenu] = useState<string | null>(null);
  const [openMobileMenu, setOpenMobileMenu] = useState<string | null>(null);
  const [dogNameDays, setDogNameDays] = useState<string[]>([]);
  const [currentDateLabel, setCurrentDateLabel] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const searchDialogRef = useRef<HTMLDivElement>(null);
  const searchReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const internalTrailRef = useRef<string[]>([]);
  const menuReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const headerRef = useRef<HTMLElement>(null);
  const suppressMenuFocus = useRef(false);
  const pathname = usePathname();
  const router = useRouter();
  const partnerHref = partnerAuthenticated ? "/partner" : "/partner/prihlasenie";
  const partnerLabel = "Partner účet";
  const nav = useMemo(() => {
    const visible = navigationItems.filter((item) => item.visible);
    return visible.filter((item) => !item.parentId).map((item) => {
      const slug = item.href.split("/").filter(Boolean)[0] ?? "";
      const sectionSlug = item.id === "novinky" && slug === "clanky" ? "novinky" : slug;
      const section = portalSections.find((candidate) => candidate.slug === sectionSlug);
      const storedChildren = visible.filter((child) => child.parentId === item.id);
      const fallbackChildren = ["steniatka", "starostlivost", "aktivity"].includes(sectionSlug)
        ? (section?.subpages ?? []).filter((subpage) => subpage.visible !== false).map((subpage, position) => ({
            id: `portal-${sectionSlug}-${subpage.slug}`,
            label: subpage.label,
            href: subpage.href ?? `/${sectionSlug}/${subpage.slug}`,
            parentId: item.id,
            position,
            visible: true,
          }))
        : [];
      return {
        ...item,
        className: sectionSlug === "pomoc-psom" ? "nav-help" : sectionSlug === "novinky" ? "nav-news" : undefined,
        title: section?.description,
        children: storedChildren.length ? storedChildren : fallbackChildren,
      };
    });
  }, [navigationItems]);

  useEffect(() => {
    const trigger = searchTriggerRef.current;
    if (!trigger) return;
    trigger.setAttribute("data-search-ready", "true");
    return () => trigger.removeAttribute("data-search-ready");
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setOpenDesktopMenu(null);
      setOpenMobileMenu(null);
      setMenuOpen(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  // Maintain a page trail strictly within Psipedia. Browser history may also
  // contain the external website that led the visitor here.
  useEffect(() => {
    const route = window.location.pathname + window.location.search;
    const trail = internalTrailRef.current;
    if (trail[trail.length - 1] === route) return;
    const previousIndex = trail.lastIndexOf(route);
    if (previousIndex !== -1) trail.splice(previousIndex + 1);
    else trail.push(route);
  }, [pathname]);

  useEffect(() => {
    if (menuOpen || searchOpen) return;

    let start: { x: number; y: number; time: number } | null = null;
    function onTouchStart(event: globalThis.TouchEvent) {
      document.removeEventListener("touchmove", onTouchMove);
      start = null;
      if (event.touches.length !== 1 || !window.matchMedia("(max-width: 767px)").matches) return;
      const touch = event.touches[0];
      // Do not compete with the browser\'s left/right edge gestures. Chrome
      // may own those gestures before any page touch events arrive.
      if (touch.clientX < Math.max(28, window.innerWidth * 0.32) || touch.clientX > window.innerWidth - 8) return;
      const target = event.target;
      if (!(target instanceof Element) || target.closest(
        '#mobile-menu, .search-modal, [role="dialog"], [role="slider"], input, textarea, select, button, [contenteditable="true"], .gm-style, .leaflet-container, .maplibregl-map, .swiper, [data-no-swipe-back]',
      )) return;
      // Don't steal horizontal carousels, maps, or scrollable tables.
      for (let node: Element | null = target; node; node = node.parentElement) {
        const style = window.getComputedStyle(node);
        if (/auto|scroll/.test(style.overflowX) && node.scrollWidth > node.clientWidth + 8) return;
      }
      start = { x: touch.clientX, y: touch.clientY, time: Date.now() };
      document.addEventListener("touchmove", onTouchMove, { passive: false });
    }
    function onTouchMove(event: globalThis.TouchEvent) {
      if (!start || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const left = start.x - touch.clientX;
      const vertical = Math.abs(start.y - touch.clientY);
      // Claim only a clear inward left swipe; vertical scrolling remains native.
      if (left > 8 && vertical < left * 0.38 && event.cancelable) event.preventDefault();
    }
    function onTouchEnd(event: globalThis.TouchEvent) {
      document.removeEventListener("touchmove", onTouchMove);
      const origin = start;
      start = null;
      if (!origin || event.changedTouches.length !== 1) return;
      const touch = event.changedTouches[0];
      const left = origin.x - touch.clientX;
      const vertical = Math.abs(touch.clientY - origin.y);
      if (left < 85 || vertical > Math.min(65, left * 0.38) || Date.now() - origin.time > 1100) return;
      const current = window.location.pathname + window.location.search;
      const trail = internalTrailRef.current;
      const previous = trail.length > 1 ? trail[trail.length - 2] : null;
      if (previous && previous !== current) router.replace(previous);
      else if (current !== "/") router.replace("/");
    }
    function onTouchCancel() {
      start = null;
      document.removeEventListener("touchmove", onTouchMove);
    }
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchCancel, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [menuOpen, pathname, router, searchOpen]);

  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const root = document.documentElement;
    const property = "--psipedia-sticky-header-height";
    const masthead = header.querySelector<HTMLElement>("[data-header-masthead]");
    const desktopBand = header.querySelector<HTMLElement>("[data-header-nav-band]");
    const update = () => {
      // Exclude the expanded mobile menu: measuring the whole header would
      // feed its own height back into the menu's viewport constraint.
      const mastheadHeight = masthead?.getBoundingClientRect().height ?? 0;
      const bandHeight = desktopBand?.getBoundingClientRect().height ?? 0;
      const borderHeight = Number.parseFloat(getComputedStyle(header).borderBottomWidth) || 0;
      root.style.setProperty(property, `${Math.ceil(mastheadHeight + bandHeight + borderHeight)}px`);
    };
    update();

    const observer = new ResizeObserver(update);
    if (masthead) observer.observe(masthead);
    if (desktopBand) observer.observe(desktopBand);
    return () => {
      observer.disconnect();
      root.style.removeProperty(property);
    };
  }, []);

  useLayoutEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;

    let id = hash.slice(1);
    try {
      id = decodeURIComponent(id);
    } catch {
      // Keep the raw fragment if it is not valid URI encoding.
    }

    const target = document.getElementById(id);
    if (!target) return;

    // Browsers can perform the initial hash scroll before the hydrated sticky
    // header has its final measured height. Align once immediately and once
    // after layout settles so the target respects its scroll-margin-top.
    target.scrollIntoView({ block: "start" });
    const frame = window.requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!headerRef.current?.contains(event.target as Node)) {
        setOpenDesktopMenu(null);
        setOpenMobileMenu(null);
        setMenuOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpenDesktopMenu((current) => {
        if (current) {
          suppressMenuFocus.current = true;
          headerRef.current?.querySelector<HTMLButtonElement>(`[data-menu-toggle="${current}"]`)?.focus();
          queueMicrotask(() => { suppressMenuFocus.current = false; });
        }
        return null;
      });
      setOpenMobileMenu(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    function updateCount() {
      try {
        setFavoriteCount(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]").length);
      } catch {
        setFavoriteCount(0);
      }
    }
    updateCount();
    window.addEventListener("psipedia-favorites-changed", updateCount);
    window.addEventListener("storage", updateCount);
    return () => {
      window.removeEventListener("psipedia-favorites-changed", updateCount);
      window.removeEventListener("storage", updateCount);
    };
  }, []);

  useEffect(() => {
    const formatter = new Intl.DateTimeFormat("sk-SK", {
      timeZone: "Europe/Bratislava",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    function updateCurrentDate() {
      setCurrentDateLabel(formatter.format(new Date()));
    }

    updateCurrentDate();
    const timer = window.setInterval(updateCurrentDate, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    async function updateDogNameDay() {
      try {
        const response = await fetch("/api/name-days/today", { cache: "no-store" });
        if (!response.ok) throw new Error("name-day lookup failed");
        const payload = await response.json() as { names?: unknown };
        const next = Array.isArray(payload.names)
          ? payload.names.flatMap((value) => {
              const name = typeof value === "string" ? value.trim() : "";
              return name ? [name] : [];
            })
          : [];
        if (active) setDogNameDays((current) => current.join("\u0000") === next.join("\u0000") ? current : next);
      } catch {
        if (active) setDogNameDays([]);
      }
    }
    void updateDogNameDay();
    const timer = window.setInterval(() => { void updateDogNameDay(); }, 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    // At the top of the page the name-day strip can push the sticky header
    // below the viewport edge. After scrolling it sticks to 0 instead.
    // Measure the actual menu entry point without locking document scrolling.
    const root = document.documentElement;
    const masthead = headerRef.current?.querySelector<HTMLElement>("[data-header-masthead]");
    const initialScrollY = window.scrollY;
    const update = () => {
      if (Math.abs(window.scrollY - initialScrollY) > 12) {
        setOpenMobileMenu(null);
        setMenuOpen(false);
        return;
      }
      const bottom = masthead?.getBoundingClientRect().bottom ?? 68;
      root.style.setProperty("--psipedia-mobile-menu-top", `${Math.ceil(Math.max(0, bottom))}px`);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      root.style.removeProperty("--psipedia-mobile-menu-top");
    };
  }, [menuOpen]);

  // The content list keeps native scrolling. Only the visibly marked grabber
  // owns drawer dismissal so ordinary attempts to browse don't close the menu.
  useEffect(() => {
    if (!menuOpen) return;
    const menu = mobileMenuRef.current;
    const nav = menu?.querySelector<HTMLElement>("nav");
    const grip = menu?.querySelector<HTMLButtonElement>("[data-menu-dismiss-grip]");
    if (!nav || !grip) return;
    nav.scrollTop = 0;
    let startY: number | null = null;
    let distance = 0;

    const reset = () => {
      startY = null;
      distance = 0;
      nav.style.transition = "transform 180ms ease";
      nav.style.transform = "";
    };
    function onStart(event: globalThis.TouchEvent) {
      if (event.touches.length !== 1) return;
      startY = event.touches[0].clientY;
      distance = 0;
      nav!.style.transition = "none";
    }
    function onMove(event: globalThis.TouchEvent) {
      if (startY === null || event.touches.length !== 1) return;
      distance = Math.max(0, Math.min(180, event.touches[0].clientY - startY));
      if (event.cancelable) event.preventDefault();
      nav!.style.transform = "translate3d(0," + distance + "px,0)";
    }
    function onEnd() {
      const close = startY !== null && distance >= 60;
      reset();
      if (close) {
        setOpenMobileMenu(null);
        setMenuOpen(false);
      }
    }
    grip.addEventListener("touchstart", onStart, { passive: true });
    grip.addEventListener("touchmove", onMove, { passive: false });
    grip.addEventListener("touchend", onEnd, { passive: true });
    grip.addEventListener("touchcancel", reset, { passive: true });
    return () => {
      grip.removeEventListener("touchstart", onStart);
      grip.removeEventListener("touchmove", onMove);
      grip.removeEventListener("touchend", onEnd);
      grip.removeEventListener("touchcancel", reset);
      nav.style.transition = "";
      nav.style.transform = "";
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const menu = mobileMenuRef.current;
    const trigger = menuReturnFocusRef.current;
    if (!menu || !trigger) return;

    function focusableMenuItems() {
      return Array.from(menu!.querySelectorAll<HTMLElement>('a[href], button:not([disabled]):not([tabindex="-1"])'))
        .filter((element) => element.offsetParent !== null && !element.closest("[inert]"));
    }

    function onMenuKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (openMobileMenu) {
          const submenuToggle = menu.querySelector<HTMLButtonElement>(`[aria-controls="mobile-submenu-${openMobileMenu}"]`);
          setOpenMobileMenu(null);
          submenuToggle?.focus();
          return;
        }
        setMenuOpen(false);
        trigger.focus();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusableMenuItems();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (active === trigger) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (!items.includes(active as HTMLElement)) {
        event.preventDefault();
        trigger.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        trigger.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        trigger.focus();
      }
    }

    document.addEventListener("keydown", onMenuKeyDown);
    return () => document.removeEventListener("keydown", onMenuKeyDown);
  }, [menuOpen, openMobileMenu]);

  useEffect(() => {
    if (!searchOpen) return;
    const previous = document.body.style.overflow;
    const trigger = searchReturnFocusRef.current;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setSearchOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = searchDialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('input, button:not([disabled]), a[href]'))
        .filter((element) => element.offsetParent !== null);
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
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
      if (trigger && document.body.contains(trigger)) queueMicrotask(() => trigger.focus());
    };
  }, [searchOpen]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    const clean = query.trim();
    if (clean.length >= 2) window.location.href = `/hladat?q=${encodeURIComponent(clean)}`;
  }

  function openSearch(trigger?: HTMLButtonElement) {
    if (trigger) searchReturnFocusRef.current = trigger;
    setMenuOpen(false);
    setSearchOpen(true);
  }

  function goBackWithinSite() {
    const current = window.location.pathname + window.location.search;
    const trail = internalTrailRef.current;
    const previous = trail.length > 1 ? trail[trail.length - 2] : null;
    router.replace(previous && previous !== current ? previous : "/");
  }

  function menuButton(className: string) {
    return (
      <button
        className={`icon-button menu-trigger ${className}`}
        type="button"
        onClick={(event) => {
          menuReturnFocusRef.current = event.currentTarget;
          setMenuOpen((value) => {
            if (value) setOpenMobileMenu(null);
            return !value;
          });
        }}
        aria-expanded={menuOpen}
        aria-controls="mobile-menu"
        aria-label={menuOpen ? "Zavrieť menu" : "Otvoriť menu"}
      >
        {menuOpen ? <CloseIcon /> : <MenuIcon />}
      </button>
    );
  }

  return (
    <>
      <nav aria-label="Rýchla navigácia">
        <a className="skip-link" href="#obsah">Preskočiť na obsah</a>
      </nav>
      {dogNameDays.length > 0 ? (
        <div className={styles.mobileNameDay} data-mobile-name-day>
          <span>Psie meniny</span>
          <strong>{dogNameDays.join(", ")}</strong>
          {currentDateLabel ? <i className={styles.nameDayDivider} aria-hidden="true" /> : null}
          {currentDateLabel ? <time className={styles.currentDate}>{currentDateLabel}</time> : null}
        </div>
      ) : null}

      <header className="site-header" ref={headerRef}>
        <div className={`header-inner shell public-shell ${styles.masthead}`} data-header-masthead>
          <div className={styles.mobileNavControls}>
            {menuButton(styles.mobileLeftTrigger)}
            {pathname !== "/" && (
              <button
                type="button"
                className={styles.backNavButton}
                onClick={goBackWithinSite}
                aria-label="Späť na predchádzajúcu stránku Psipedie"
                title="Späť v Psipedii"
              >
                <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M19 12H5m7-7-7 7 7 7" />
                </svg>
              </button>
            )}
          </div>
          <div className={styles.brandCluster}>
            <Link href="/" className="brand" aria-label="Psipedia.sk – domov" data-header-brand>
              <span className="brand-mark"><PawMark size={29} /></span>
              <span>psi<span>pedia</span><small>.sk</small></span>
            </Link>
          </div>

          {dogNameDays.length > 0 ? (
            <div className={styles.desktopNameDay} data-header-secondary>
              <span>Psie meniny</span>
              <strong>{dogNameDays.join(", ")}</strong>
              {currentDateLabel ? <i className={styles.nameDayDivider} aria-hidden="true" /> : null}
              {currentDateLabel ? <time className={styles.currentDate}>{currentDateLabel}</time> : null}
            </div>
          ) : null}

          <div className="header-actions">
            <Link href="/o-nas#kontakt" className="header-contact-link">Kontakt</Link>
            <Link href={partnerHref} className="header-contact-link" data-partner-login-entry>{partnerLabel}</Link>
            <button ref={searchTriggerRef} className="icon-button search-trigger" type="button" onClick={(event) => openSearch(event.currentTarget)} aria-label="Otvoriť vyhľadávanie" data-search-ready="false">
              <SearchIcon />
              <span>Hľadať</span>
            </button>
            <Link href="/oblubene" className="icon-button favorites-link" aria-label={`Obľúbené články${favoriteCount ? `: ${favoriteCount}` : ""}`}>
              <BookmarkIcon />
              {favoriteCount > 0 && <b>{favoriteCount}</b>}
            </Link>
            {menuButton(styles.menuRightTrigger)}
          </div>
        </div>

        <div className={styles.desktopNavBand} data-header-nav-band>
          <nav className={`desktop-nav ${styles.desktopNav}`} aria-label="Hlavná navigácia">
            {nav.map((item) => item.children.length ? (
              <div
                className={`nav-group ${openDesktopMenu === item.id ? "is-open" : ""}`}
                key={item.id}
                onMouseEnter={() => setOpenDesktopMenu(item.id)}
                onMouseLeave={(event) => {
                  if (!event.currentTarget.contains(document.activeElement)) setOpenDesktopMenu(null);
                }}
                onFocusCapture={() => {
                  if (!suppressMenuFocus.current) setOpenDesktopMenu(item.id);
                }}
                onBlurCapture={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpenDesktopMenu(null);
                }}
              >
                <Link
                  href={item.href}
                  className={item.className}
                  title={item.title}
                  data-active={isPathActive(pathname, item.href) ? "true" : undefined}
                  aria-current={pathname === item.href ? "page" : undefined}
                  onClick={() => setOpenDesktopMenu(null)}
                >{item.label}</Link>
                <button
                  type="button"
                  className="nav-submenu-toggle"
                  data-menu-toggle={item.id}
                  aria-label={`${openDesktopMenu === item.id ? "Zavrieť" : "Otvoriť"} podmenu ${item.label}`}
                  aria-expanded={openDesktopMenu === item.id}
                  aria-controls={`desktop-submenu-${item.id}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setOpenDesktopMenu((current) => current === item.id ? null : item.id)}
                ><ChevronDownIcon className={styles.navChevron} /></button>
                <div id={`desktop-submenu-${item.id}`} className="nav-submenu">
                  {item.children.map((child) => <Link href={child.href} key={child.id} data-active={isPathActive(pathname, child.href) ? "true" : undefined} aria-current={pathname === child.href ? "page" : undefined} onClick={() => setOpenDesktopMenu(null)}>{child.label}</Link>)}
                </div>
              </div>
            ) : <Link href={item.href} className={item.className} title={item.title} key={item.id} data-active={isPathActive(pathname, item.href) ? "true" : undefined} aria-current={pathname === item.href ? "page" : undefined}>{item.label}</Link>)}
          </nav>
        </div>

        <div ref={mobileMenuRef} id="mobile-menu" className={`mobile-menu ${menuOpen ? "is-open" : ""}`} aria-hidden={!menuOpen} inert={!menuOpen}>
          <nav className="shell public-shell" aria-label="Mobilná navigácia">
            <button
              type="button"
              className={styles.menuDismissGrip}
              tabIndex={-1}
              data-menu-dismiss-grip
              onClick={() => { setOpenMobileMenu(null); setMenuOpen(false); }}
              aria-label="Zavrieť navigačné menu"
              title="Potiahni nadol alebo klepni pre zatvorenie"
            >
              <span aria-hidden="true" />
            </button>
            {nav.map((item) => (
              <div className={`mobile-nav-group ${openMobileMenu === item.id ? "is-open" : ""}`} key={item.id}>
                <div className="mobile-nav-parent">
                  <Link href={item.href} className={item.className} title={item.title} data-active={isPathActive(pathname, item.href) ? "true" : undefined} aria-current={pathname === item.href ? "page" : undefined} onClick={() => setMenuOpen(false)}>{item.label}</Link>
                  {item.children.length > 0 && (
                    <button
                      type="button"
                      className="mobile-submenu-toggle"
                      aria-label={`${openMobileMenu === item.id ? "Zavrieť" : "Otvoriť"} podmenu ${item.label}`}
                      aria-expanded={openMobileMenu === item.id}
                      aria-controls={`mobile-submenu-${item.id}`}
                      onClick={() => setOpenMobileMenu((current) => current === item.id ? null : item.id)}
                    ><ChevronDownIcon className={styles.navChevron} /></button>
                  )}
                </div>
                {item.children.length > 0 && (
                  <div
                    id={`mobile-submenu-${item.id}`}
                    className="mobile-nav-children"
                    aria-hidden={openMobileMenu !== item.id}
                    inert={openMobileMenu !== item.id}
                  >
                    <div>{item.children.map((child) => <Link href={child.href} key={child.id} data-active={isPathActive(pathname, child.href) ? "true" : undefined} aria-current={pathname === child.href ? "page" : undefined} onClick={() => setMenuOpen(false)}>{child.label}</Link>)}</div>
                  </div>
                )}
              </div>
            ))}
            <div className={styles.mobileUtilityLinks}><Link href="/o-nas#kontakt" className="mobile-contact-link" onClick={() => setMenuOpen(false)}>Kontakt</Link><Link href={partnerHref} className="mobile-contact-link" data-partner-login-entry onClick={() => setMenuOpen(false)}>{partnerLabel}</Link></div>
            <button type="button" onClick={(event) => openSearch(event.currentTarget)}><SearchIcon /> Hľadať na Psipedii</button>
          </nav>
        </div>
        <NavigationProgress />
      </header>

      {menuOpen && (
        <button
          type="button"
          className={styles.mobileMenuBackdrop}
          onClick={() => { setOpenMobileMenu(null); setMenuOpen(false); }}
          aria-label="Zavrieť navigáciu klepnutím mimo menu"
        />
      )}

      {searchOpen && (
        <div ref={searchDialogRef} className="search-modal" role="dialog" aria-modal="true" aria-label="Vyhľadávanie">
          <button className="search-backdrop" type="button" onClick={() => setSearchOpen(false)} aria-label="Zavrieť vyhľadávanie" />
          <div className="search-panel">
            <div className="search-panel-head">
              <span>Čo potrebuješ nájsť?</span>
              <button className="icon-button" type="button" onClick={() => setSearchOpen(false)} aria-label="Zavrieť"><CloseIcon /></button>
            </div>
            <form className="search-form" onSubmit={submitSearch}>
              <SearchIcon size={24} />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                maxLength={120}
                placeholder="Skús „veterinár v Trnave“, „labrador“…"
                aria-label="Hľadaný výraz"
              />
              <button type="submit">Hľadať</button>
            </form>
            <div className="search-results" aria-live="polite">
              <p className="search-hint">
                Prehľadávame články, novinky, plemená, podujatia, odborníkov aj pomoc psom. Napíš výraz a stlač Hľadať.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
