"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Fuse from "fuse.js";
import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { adminNavigationGroups } from "@/lib/admin-navigation";
import { isIosWebKitDevice } from "@/lib/admin-navigation-device";
import { ADMIN_NAVIGATION_INTENT_EVENT, type AdminNavigationIntent } from "@/lib/admin-editor-navigation";
import styles from "./admin-quick-navigation.module.css";

type Destination = { label: string; category: string; href: string; keywords: string; subtitle?: string };
type CachedRecords = { results: Destination[]; incomplete: boolean; expiresAt: number };
const SEARCH_DEBOUNCE_MS = 140;
const SEARCH_CACHE_TTL_MS = 15_000;
const SEARCH_CACHE_LIMIT = 24;
const shouldSearchRecords = (value: string) => value.trim().length >= 2 || /^\d$/.test(value.trim());

// Keep the regular sidebar as the single authority for main destinations.
// Only deeper, verified admin routes are added below for fast access.
const additionalDestinations: Destination[] = [
  { label: "Adopcie", category: "Pomoc psom", href: "/admin/adopcie", keywords: "adoptovať adopcia pes psi" },
  { label: "Stratené a nájdené psy", category: "Pomoc psom", href: "/admin/stratene-najdene", keywords: "strateny najdeny hladam psa" },
  { label: "Organizácie", category: "Pomoc psom", href: "/admin/organizacie", keywords: "utulky ochrana pomoc organizacia" },
  { label: "Katalóg služieb", category: "Služby pre psov", href: "/admin/sluzby-pre-psov/katalog", keywords: "veterinari treneri salony vlastnosti sluzby" },
  { label: "Nastavenia Notion", category: "Nastavenia", href: "/admin/nastavenia/notion", keywords: "notion synchronizacia sync polia diagnostika" },
];
const aliases: Record<string, string> = {
  "/admin/sluzby-pre-psov": "veterinari veterina veterinár salóny treneri fyzioterapia služby",
  "/admin/podujatia": "kalendar akcie podujatie vystavy seminare",
  "/admin/komponenty": "bannery sablony komponent znovupouzitie",
  "/admin/clanky": "novinky clanky obsah publikovanie",
  "/admin/plemena": "plemena psi labrador FCI",
  "/admin/facebook-obrazky": "grafiky prispevky facebook socialne siete",
  "/admin/kvalita": "kvalita dat kontrola AI opravy",
};
const destinations: Destination[] = [
  ...adminNavigationGroups.flatMap(group => group.items.map(item => ({
    label: item.label, category: group.label, href: item.href, keywords: aliases[item.href] ?? "",
  }))),
  ...additionalDestinations,
].filter((item, index, all) => all.findIndex(other => other.href === item.href) === index);

const search = new Fuse(destinations, {
  keys: [{ name: "label", weight: 0.6 }, { name: "category", weight: 0.2 }, { name: "keywords", weight: 0.2 }],
  threshold: 0.37,
  ignoreLocation: true,
  ignoreDiacritics: true,
});
const suggestedHrefs = new Set([
  "/admin/podujatia", "/admin/sluzby-pre-psov", "/admin/adopcie",
  "/admin/clanky", "/admin/nastavenia/notion", "/admin/komponenty",
]);

export function AdminQuickNavigationDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (value: boolean) => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [records, setRecords] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(false);
  const [incomplete, setIncomplete] = useState(false);
  const [searchError, setSearchError] = useState("");
  const cache = useRef(new Map<string, CachedRecords>());

  useEffect(() => {
    const term = query.trim();
    if (!open || !shouldSearchRecords(term)) return;

    const cached = cache.current.get(term);
    if (cached && cached.expiresAt > Date.now()) {
      setRecords(cached.results);
      setIncomplete(cached.incomplete);
      setSearchError("");
      setLoading(false);
      return;
    }
    if (cached) cache.current.delete(term);

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/admin/global-search?q=" + encodeURIComponent(term), {
          credentials: "same-origin", cache: "no-store", signal: controller.signal,
        });
        const data = await response.json() as {
          results?: Array<{ title: string; subtitle: string; href: string; category: string }>;
          incomplete?: boolean;
          error?: string;
        };
        if (!response.ok) throw new Error(data.error ?? "Vyhľadávanie nie je dostupné.");
        if (controller.signal.aborted) return;
        const results = (data.results ?? []).map(record => ({
          label: record.title, subtitle: record.subtitle, category: record.category,
          href: record.href, keywords: "",
        }));
        const incomplete = Boolean(data.incomplete);
        cache.current.delete(term);
        cache.current.set(term, { results, incomplete, expiresAt: Date.now() + SEARCH_CACHE_TTL_MS });
        if (cache.current.size > SEARCH_CACHE_LIMIT) {
          const oldest = cache.current.keys().next().value;
          if (oldest !== undefined) cache.current.delete(oldest);
        }
        setRecords(results);
        setIncomplete(incomplete);
        setSearchError("");
        setLoading(false);
      } catch (error) {
        if (!controller.signal.aborted) {
          setSearchError(error instanceof Error ? error.message : "Vyhľadávanie nie je dostupné.");
          setLoading(false);
        }
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [open, query]);


  const sectionResults = query.trim()
    ? search.search(query.trim(), { limit: 12 }).map(match => match.item)
    : destinations.filter(item => suggestedHrefs.has(item.href));
  // Exact section destinations and backend records share one listbox, but the
  // endpoint only searches stored data after two characters.
  const results = [...sectionResults, ...(shouldSearchRecords(query) ? records : [])]
    .filter((item, index, all) => all.findIndex(candidate => candidate.href === item.href) === index);
  const selected = Math.min(active, Math.max(0, results.length - 1));

  function changeOpen(value: boolean) {
    onOpenChange(value);
  }
  function go(href: string) {
    const navigate = () => {
      const target = new URL(href, window.location.origin);
      if (target.origin === window.location.origin &&
        (target.pathname === "/admin" || target.pathname === "/admin/clanky") &&
        window.matchMedia("(max-width: 820px)").matches &&
        isIosWebKitDevice(navigator.userAgent, navigator.platform, navigator.maxTouchPoints)) {
        window.location.assign(target.href);
        return;
      }
      router.push(href);
    };
    // Ctrl+K uses buttons. Ask the shared dirty editor guard before router.push,
    // preserving the current draft if the user declines the exit.
    changeOpen(false);
    const event = new CustomEvent<AdminNavigationIntent>(ADMIN_NAVIGATION_INTENT_EVENT, {
      cancelable: true,
      detail: { href, navigate },
    });
    if (!window.dispatchEvent(event)) return;
    navigate();
  }
  function handleKeys(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && results.length) {
      event.preventDefault();
      setActive(value => (value + 1) % results.length);
    } else if (event.key === "ArrowUp" && results.length) {
      event.preventDefault();
      setActive(value => (value + results.length - 1) % results.length);
    } else if (event.key === "Enter" && results.length) {
      event.preventDefault();
      go(results[selected].href);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.dialog} data-admin-quick-navigation>
          <div className={styles.header}>
            <div>
              <Dialog.Title>Hľadať v celej administrácii</Dialog.Title>
              <Dialog.Description>Vyhľadávaj názov alebo číselné Admin ID vo všetkých sekciách.</Dialog.Description>
            </div>
            <Dialog.Close className={styles.close} aria-label="Zavrieť vyhľadávanie"><X size={18} /></Dialog.Close>
          </div>
          <div className={styles.searchRow}>
            <Search size={19} aria-hidden="true" />
            <input
              autoFocus
              role="combobox"
              aria-label="Vyhľadať profil, obsah alebo funkciu"
              aria-expanded="true"
              aria-autocomplete="list"
              aria-controls="admin-quick-navigation-results"
              aria-activedescendant={results.length ? "admin-quick-nav-option-" + selected : undefined}
              value={query}
              onChange={event => { setQuery(event.target.value); setActive(0); setRecords([]); setLoading(shouldSearchRecords(event.target.value)); setSearchError(""); setIncomplete(false); }}
              onKeyDown={handleKeys}
              placeholder="Názov profilu alebo Admin ID (napr. 1842)…"
            />
          </div>
          <div className={styles.results} id="admin-quick-navigation-results" role="listbox" aria-label="Dostupné sekcie">
            {results.length ? results.map((item, index) => (
              <button
                key={item.href}
                id={"admin-quick-nav-option-" + index}
                type="button"
                role="option"
                aria-selected={index === selected}
                data-active={index === selected ? "true" : undefined}
                className={styles.result}
                onMouseEnter={() => setActive(index)}
                onClick={() => go(item.href)}
              >
                <span><strong>{item.label}</strong><small>{item.category}{item.subtitle ? " · " + item.subtitle : ""}</small></span>
                <span className={styles.arrow} aria-hidden="true">↗</span>
              </button>
            )) : !loading && <p className={styles.empty}>Takúto sekciu som nenašiel. Skús iné slovo.</p>}
          </div>
          {loading && <p className={styles.searchFeedback} role="status">Hľadám záznamy…</p>}
          {searchError && <p className={styles.searchFeedback} role="alert">{searchError}</p>}
          {incomplete && <p className={styles.searchFeedback} role="status">Niektoré zdroje sú dočasne nedostupné.</p>}
          <div className={styles.footer}>↑ ↓ výber · Enter otvoriť · Esc zavrieť</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
