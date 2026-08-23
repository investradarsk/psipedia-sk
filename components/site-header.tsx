"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { PortalSearchItem } from "@/lib/portal-search";
import { portalSections } from "@/lib/portal";
import { BookmarkIcon, CloseIcon, MenuIcon, PawMark, SearchIcon } from "./icons";
import { STORAGE_KEY } from "./favorite-button";

const nav = portalSections.map((section) => ({
  href: `/${section.slug}`,
  label: section.navLabel ?? section.label,
  className: section.slug === "pomoc-psom" ? "nav-help" : section.slug === "novinky" ? "nav-news" : undefined,
}));

function normalizeSearch(value: string) {
  return value.toLocaleLowerCase("sk").normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

export function SiteHeader({ searchIndex }: { searchIndex: PortalSearchItem[] }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [favoriteCount, setFavoriteCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const matches = useMemo(() => {
    const normalized = normalizeSearch(query.trim());
    if (normalized.length < 2) return [];
    return searchIndex
      .filter((item) => normalizeSearch(`${item.title} ${item.description} ${item.keywords} ${item.type}`).includes(normalized))
      .sort((a, b) => {
        const aTitle = normalizeSearch(a.title); const bTitle = normalizeSearch(b.title);
        return Number(bTitle.startsWith(normalized)) - Number(aTitle.startsWith(normalized)) || a.title.localeCompare(b.title, "sk");
      })
      .slice(0, 7);
  }, [query, searchIndex]);

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
            {nav.map((item) => <Link href={item.href} className={item.className} key={item.href}>{item.label}</Link>)}
          </nav>

          <div className="header-actions">
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
            {nav.map((item) => <Link href={item.href} className={item.className} key={item.href} onClick={() => setMenuOpen(false)}>{item.label}</Link>)}
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
              {query.trim().length < 2 ? (
                <p className="search-hint">Prehľadávame články, plemená, podujatia, odborníkov aj pomoc psom.</p>
              ) : matches.length > 0 ? (
                matches.map((match) => (
                  <a
                    href={match.href}
                    key={match.href}
                    onClick={(event) => {
                      event.preventDefault();
                      window.location.assign(match.href);
                    }}
                  >
                    <span>{match.type}</span>
                    <strong>{match.title}</strong>
                  </a>
                ))
              ) : (
                <p className="search-hint">Nič sme nenašli. Skús všeobecnejšie slovo.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
