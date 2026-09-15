"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { NavigationItem } from "@/lib/navigation";
import { portalSections } from "@/lib/portal";
import { BookmarkIcon, CloseIcon, MenuIcon, PawMark, SearchIcon } from "./icons";
import { STORAGE_KEY } from "./favorite-button";
import { NavigationProgress } from "./navigation-progress";

export function SiteHeader({ navigationItems }: { navigationItems: NavigationItem[] }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [openDesktopMenu, setOpenDesktopMenu] = useState<string | null>(null);
  const [openMobileMenu, setOpenMobileMenu] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const suppressMenuFocus = useRef(false);
  const pathname = usePathname();
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

  return (
    <>
      <nav aria-label="Rýchla navigácia">
        <a className="skip-link" href="#obsah">Preskočiť na obsah</a>
      </nav>
      <header className="site-header" ref={headerRef}>
        <div className="header-inner shell public-shell">
          <Link href="/" className="brand" aria-label="Psipedia.sk – domov">
            <span className="brand-mark"><PawMark size={29} /></span>
            <span>psi<span>pedia</span><small>.sk</small></span>
          </Link>

          <nav className="desktop-nav" aria-label="Hlavná navigácia">
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
                <Link href={item.href} className={item.className} title={item.title} onClick={() => setOpenDesktopMenu(null)}>{item.label}</Link>
                <button
                  type="button"
                  className="nav-submenu-toggle"
                  data-menu-toggle={item.id}
                  aria-label={`${openDesktopMenu === item.id ? "Zavrieť" : "Otvoriť"} podmenu ${item.label}`}
                  aria-expanded={openDesktopMenu === item.id}
                  aria-controls={`desktop-submenu-${item.id}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setOpenDesktopMenu((current) => current === item.id ? null : item.id)}
                ><span aria-hidden="true">⌄</span></button>
                <div id={`desktop-submenu-${item.id}`} className="nav-submenu">
                  {item.children.map((child) => <Link href={child.href} key={child.id} onClick={() => setOpenDesktopMenu(null)}>{child.label}</Link>)}
                </div>
              </div>
            ) : <Link href={item.href} className={item.className} title={item.title} key={item.id}>{item.label}</Link>)}
          </nav>

          <div className="header-actions">
            <Link href="/o-nas#kontakt" className="header-contact-link">Kontakt</Link>
            <button className="icon-button search-trigger" type="button" onClick={openSearch} aria-label="Otvoriť vyhľadávanie">
              <SearchIcon />
              <span>Hľadať</span>
            </button>
            <Link href="/oblubene" className="icon-button favorites-link" aria-label={`Obľúbené články${favoriteCount ? `: ${favoriteCount}` : ""}`}>
              <BookmarkIcon />
              {favoriteCount > 0 && <b>{favoriteCount}</b>}
            </Link>
            <button
              className="icon-button menu-trigger"
              type="button"
              onClick={() => setMenuOpen((value) => {
                if (value) setOpenMobileMenu(null);
                return !value;
              })}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              aria-label={menuOpen ? "Zavrieť menu" : "Otvoriť menu"}
            >
              {menuOpen ? <CloseIcon /> : <MenuIcon />}
            </button>
          </div>
        </div>

        <div id="mobile-menu" className={`mobile-menu ${menuOpen ? "is-open" : ""}`} aria-hidden={!menuOpen} inert={!menuOpen}>
          <nav className="shell public-shell" aria-label="Mobilná navigácia">
            {nav.map((item) => (
              <div className={`mobile-nav-group ${openMobileMenu === item.id ? "is-open" : ""}`} key={item.id}>
                <div className="mobile-nav-parent">
                  <Link href={item.href} className={item.className} title={item.title} onClick={() => setMenuOpen(false)}>{item.label}</Link>
                  {item.children.length > 0 && (
                    <button
                      type="button"
                      className="mobile-submenu-toggle"
                      aria-label={`${openMobileMenu === item.id ? "Zavrieť" : "Otvoriť"} podmenu ${item.label}`}
                      aria-expanded={openMobileMenu === item.id}
                      aria-controls={`mobile-submenu-${item.id}`}
                      onClick={() => setOpenMobileMenu((current) => current === item.id ? null : item.id)}
                    ><span aria-hidden="true">⌄</span></button>
                  )}
                </div>
                {item.children.length > 0 && (
                  <div
                    id={`mobile-submenu-${item.id}`}
                    className="mobile-nav-children"
                    aria-hidden={openMobileMenu !== item.id}
                    inert={openMobileMenu !== item.id}
                  >
                    <div>{item.children.map((child) => <Link href={child.href} key={child.id} onClick={() => setMenuOpen(false)}>{child.label}</Link>)}</div>
                  </div>
                )}
              </div>
            ))}
            <Link href="/o-nas#kontakt" className="mobile-contact-link" onClick={() => setMenuOpen(false)}>Kontakt</Link>
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
