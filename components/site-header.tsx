"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
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
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const menuReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const headerRef = useRef<HTMLElement>(null);
  const suppressMenuFocus = useRef(false);
  const pathname = usePathname();
  const partnerHref = partnerAuthenticated ? "/partner" : "/partner/prihlasenie";
  const partnerLabel = partnerAuthenticated ? "Partner účet" : "Prihlásiť sa";
  const nav = useMemo(() => {
    const visible = navigationItems.filter((item) => item.visible);
    return visible.filter((item) => !item.parentId).map((item) => {
      const slug = item.href.split("/").filter(Boolean)[0] ?? "";
      const section = portalSections.find((candidate) => candidate.slug === slug);
      const storedChildren = visible.filter((child) => child.parentId === item.id);
      const fallbackChildren = ["steniatka", "starostlivost", "aktivity"].includes(slug)
        ? (section?.subpages ?? []).filter((subpage) => subpage.visible !== false).map((subpage, position) => ({
            id: `portal-${slug}-${subpage.slug}`,
            label: subpage.label,
            href: subpage.href ?? `/${slug}/${subpage.slug}`,
            parentId: item.id,
            position,
            visible: true,
          }))
        : [];
      return {
        ...item,
        className: slug === "pomoc-psom" ? "nav-help" : slug === "novinky" ? "nav-news" : undefined,
        title: section?.description,
        children: storedChildren.length ? storedChildren : fallbackChildren,
      };
    });
  }, [navigationItems]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setOpenDesktopMenu(null);
      setOpenMobileMenu(null);
      setMenuOpen(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const root = document.documentElement;
    const property = "--psipedia-sticky-header-height";
    const update = () => {
      root.style.setProperty(property, `${Math.ceil(header.getBoundingClientRect().height)}px`);
    };
    update();

    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => {
      observer.disconnect();
      root.style.removeProperty(property);
    };
  }, []);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!headerRef.current?.contains(event.target as Node)) {
        setOpenDesktopMenu(null);
        setOpenMobileMenu(null);
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
    const menu = mobileMenuRef.current;
    const trigger = menuReturnFocusRef.current;
    if (!menu || !trigger) return;

    function focusableMenuItems() {
      return Array.from(menu!.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'))
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
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSearchOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [searchOpen]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    const clean = query.trim();
    if (clean) window.location.href = `/hladat?q=${encodeURIComponent(clean)}`;
  }

  function openSearch() {
    setMenuOpen(false);
    setSearchOpen(true);
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
      <header className="site-header" ref={headerRef}>
        <div className={`header-inner shell public-shell ${styles.masthead}`} data-header-masthead>
          {menuButton(styles.mobileLeftTrigger)}
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
            <button className="icon-button search-trigger" type="button" onClick={openSearch} aria-label="Otvoriť vyhľadávanie">
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

        {dogNameDays.length > 0 ? (
          <div className={styles.mobileNameDay} data-mobile-name-day>
            <span>Psie meniny</span>
            <strong>{dogNameDays.join(", ")}</strong>
            {currentDateLabel ? <i className={styles.nameDayDivider} aria-hidden="true" /> : null}
            {currentDateLabel ? <time className={styles.currentDate}>{currentDateLabel}</time> : null}
          </div>
        ) : null}

        <div ref={mobileMenuRef} id="mobile-menu" className={`mobile-menu ${menuOpen ? "is-open" : ""}`} aria-hidden={!menuOpen} inert={!menuOpen}>
          <nav className="shell public-shell" aria-label="Mobilná navigácia">
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
            <button type="button" onClick={openSearch}><SearchIcon /> Hľadať na Psipedii</button>
          </nav>
        </div>
        <NavigationProgress />
      </header>

      {searchOpen && (
        <div className="search-modal" role="dialog" aria-modal="true" aria-label="Vyhľadávanie">
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
                placeholder="Skús „privolanie“, „labrador“..."
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
