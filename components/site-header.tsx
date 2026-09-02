"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { NavigationItem } from "@/lib/navigation";
import { portalSections } from "@/lib/portal";
import { BookmarkIcon, CloseIcon, MenuIcon, PawMark, SearchIcon } from "./icons";
import { STORAGE_KEY } from "./favorite-button";

export function SiteHeader({ navigationItems }: { navigationItems: NavigationItem[] }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [favoriteCount, setFavoriteCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const nav = useMemo(() => {
    const visible = navigationItems.filter((item) => item.visible);
    return visible.filter((item) => !item.parentId).map((item) => {
      const slug = item.href.split("/").filter(Boolean)[0] ?? "";
      const section = portalSections.find((candidate) => candidate.slug === slug);
      return {
        ...item,
        className: slug === "pomoc-psom" ? "nav-help" : slug === "novinky" ? "nav-news" : undefined,
        title: section?.description,
        children: visible.filter((child) => child.parentId === item.id),
      };
    });
  }, [navigationItems]);

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
      <a className="skip-link" href="#obsah">Preskočiť na obsah</a>
      <header className="site-header">
        <div className="header-inner shell">
          <Link href="/" className="brand" aria-label="Psipedia.sk – domov">
            <span className="brand-mark"><PawMark size={29} /></span>
            <span>psi<span>pedia</span><small>.sk</small></span>
          </Link>

          <nav className="desktop-nav" aria-label="Hlavná navigácia">
            {nav.map((item) => item.children.length ? (
              <div className="nav-group" key={item.id}>
                <Link href={item.href} className={item.className} title={item.title}>{item.label}<span aria-hidden="true">⌄</span></Link>
                <div className="nav-submenu">{item.children.map((child) => <Link href={child.href} key={child.id}>{child.label}</Link>)}</div>
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
              onClick={() => setMenuOpen((value) => !value)}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              aria-label={menuOpen ? "Zavrieť menu" : "Otvoriť menu"}
            >
              {menuOpen ? <CloseIcon /> : <MenuIcon />}
            </button>
          </div>
        </div>

        <div id="mobile-menu" className={`mobile-menu ${menuOpen ? "is-open" : ""}`}>
          <nav className="shell" aria-label="Mobilná navigácia">
            {nav.map((item) => (
              <div className="mobile-nav-group" key={item.id}>
                <Link href={item.href} className={item.className} title={item.title} onClick={() => setMenuOpen(false)}>{item.label}</Link>
                {item.children.length > 0 && <div className="mobile-nav-children">{item.children.map((child) => <Link href={child.href} key={child.id} onClick={() => setMenuOpen(false)}>{child.label}</Link>)}</div>}
              </div>
            ))}
            <Link href="/o-nas#kontakt" className="mobile-contact-link" onClick={() => setMenuOpen(false)}>Kontakt</Link>
            <button type="button" onClick={openSearch}><SearchIcon /> Hľadať na Psipedii</button>
          </nav>
        </div>
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
