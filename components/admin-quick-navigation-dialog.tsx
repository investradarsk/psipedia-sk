"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Fuse from "fuse.js";
import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { adminNavigationGroups } from "@/lib/admin-navigation";
import { qualityTabs } from "@/lib/admin-quality-workspace";
import { isIosWebKitDevice } from "@/lib/admin-navigation-device";
import { mergeUniqueAdminDestinations } from "@/lib/admin-quick-navigation-results";
import { ADMIN_NAVIGATION_INTENT_EVENT, type AdminNavigationIntent } from "@/lib/admin-editor-navigation";
import styles from "./admin-quick-navigation.module.css";

type Destination = { label: string; category: string; href: string; keywords: string; subtitle?: string };
type CachedRecords = { results: Destination[]; incomplete: boolean; expiresAt: number };
const SEARCH_DEBOUNCE_MS = 140;
const SEARCH_QUERY_MAX_LENGTH = 80;
const SEARCH_CACHE_TTL_MS = 15_000;
const SEARCH_CACHE_LIMIT = 24;
const shouldSearchRecords = (value: string) => value.trim().length >= 2 || /^\d$/.test(value.trim());

// Keep the regular sidebar as the single authority for main destinations.
// Only deeper, verified admin routes are added below for fast access.
const additionalDestinations: Destination[] = [
  ...qualityTabs.filter(tab => tab.id !== "findings").map(tab => ({ label: tab.label, href: tab.href, category: "Kvalita údajov", keywords: tab.id === "seo" ? "seo metadata indexacia" : tab.id === "links" ? "nefunkcne odkazy broken links" : "chybajuce polia udaje" })),
  {label:"Adopcie",category:"Pomoc psom",href:"/admin/adopcie",keywords:"adopcia psy"},
  {label:"Stratené a nájdené",category:"Pomoc psom",href:"/admin/stratene-najdene",keywords:"stratene najdene psy"},
  {label:"Organizácie",category:"Pomoc psom",href:"/admin/organizacie",keywords:"utulky organizacie"},
  {label:"Pokrytie šteniatok",category:"Redakcia",href:"/admin/steniatka/pokrytie",keywords:"steniatka pokrytie temy"},
  {label:"Kalendár článkov",category:"Redakcia",href:"/admin/clanky/kalendar",keywords:"redakcny plan publikovanie"},
  {label:"E-shopy a recenzie",category:"Redakcia",href:"/admin/recenzie/eshopy",keywords:"eshop hodnotenie testy"},
  {label:"Koncepty automatizácií",category:"Kvalita a automatizácie",href:"/admin/automatizacie-gemini/koncepty",keywords:"gemini koncepty navrhy"},
  {label:"Overovanie zdrojov",category:"Pomoc psom",href:"/admin/operations/overovanie-zdrojov",keywords:"adopcia stratene kontrola zdrojov"},
  {label:"Partner podania",category:"Partneri",href:"/admin/partners/submissions",keywords:"registracia podanie moderacia"},
  {label:"Partner hlásenia",category:"Partneri",href:"/admin/partners/help-submissions",keywords:"stratene adopcie nahlasene"},
  {label:"Žiadosti o profil",category:"Partneri",href:"/admin/partners/claims",keywords:"claim profil schvalovanie"},
  {label:"Nastavenia Notion",category:"Systém",href:"/admin/nastavenia/notion",keywords:"notion synchronizacia konflikty"},
  {label:"Notion audit",category:"Systém",href:"/admin/nastroje/notion-audit",keywords:"notion diagnostika audit"},
  {label:"Google Place nástroje",category:"Systém",href:"/admin/nastroje/google-places",keywords:"adresy mapy"},
];
const aliases: Record<string, string> = {
  "/admin/adresar": "sluzby profily veterinari salony treneri fyzioterapia",
  "/admin/podujatia": "kalendar akcie podujatie vystavy seminare",
  "/admin/podania": "hlasenia dopyty ziadosti moderacia partner",
  "/admin/komponenty": "bannery sablony komponenty",
  "/admin/clanky": "novinky clanky publikovanie",
  "/admin/plemena": "plemena FCI labrador",
  "/admin/facebook-obrazky": "grafiky facebook socialne siete",
  "/admin/kvalita": "kvalita data AI opravy",
  "/admin/automatizacie-gemini": "automatizacie AI gemini"
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
  "/admin/clanky", "/admin/podujatia", "/admin/adresar", "/admin/pomoc-psom",
  "/admin/podania", "/admin/kvalita", "/admin/nastavenia/notion",
]);

export function AdminQuickNavigationDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (value: boolean) => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [records, setRecords] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(false);
  const [incomplete, setIncomplete] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const searchGeneration = useRef(0);
  const cache = useRef(new Map<string, CachedRecords>());
  // Match the server's 80-character bound: keystrokes beyond that limit
  // must not refetch the identical D1 query or create duplicate cache keys.
  const searchTerm = query.trim().slice(0, SEARCH_QUERY_MAX_LENGTH);

  useEffect(() => {
    const term = searchTerm;
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
    const generation = searchGeneration.current;
    const isCurrent = () => !controller.signal.aborted && generation === searchGeneration.current;
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
        if (!isCurrent()) return;
        const results = (data.results ?? []).map(record => ({
          label: record.title, subtitle: record.subtitle, category: record.category,
          href: record.href, keywords: "",
        }));
        const incomplete = Boolean(data.incomplete);
        // Partial results can be stale as soon as a migrating data source
        // recovers. Never keep incomplete responses in the local cache.
        cache.current.delete(term);
        if (!incomplete) {
          cache.current.set(term, { results, incomplete, expiresAt: Date.now() + SEARCH_CACHE_TTL_MS });
          if (cache.current.size > SEARCH_CACHE_LIMIT) {
            const oldest = cache.current.keys().next().value;
            if (oldest !== undefined) cache.current.delete(oldest);
          }
        }
        setRecords(results);
        setIncomplete(incomplete);
        setSearchError("");
        setLoading(false);
      } catch (error) {
        if (isCurrent()) {
          setSearchError(error instanceof Error ? error.message : "Vyhľadávanie nie je dostupné.");
          setIncomplete(false);
          setLoading(false);
        }
      }
    }, /^#?[1-9]\d*$/.test(term) ? 0 : SEARCH_DEBOUNCE_MS);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [open, searchTerm, retryCount]);


  // Keyboard navigation and pointer hover only update active index. Neither
  // should re-run Fuse matching or the quadratic duplicate filter.
  const sectionResults = useMemo(() => query.trim()
    ? search.search(query.trim(), { limit: 12 }).map(match => match.item)
    : destinations.filter(item => suggestedHrefs.has(item.href)), [query]);
  const results = useMemo(() => mergeUniqueAdminDestinations(
    sectionResults, shouldSearchRecords(query) ? records : [],
  ), [sectionResults, records, query]);
  const selected = Math.min(active, Math.max(0, results.length - 1));

  function changeOpen(value: boolean) {
    onOpenChange(value);
  }
  function retrySearch() {
    if (!shouldSearchRecords(searchTerm)) return;
    searchGeneration.current += 1;
    cache.current.delete(searchTerm);
    setRecords([]);
    setLoading(true);
    setSearchError("");
    setIncomplete(false);
    setRetryCount(count => count + 1);
  }
  function go(href: string) {
    // Search results can only navigate within the authenticated Admin namespace.
    const target = new URL(href, window.location.origin);
    if (target.origin !== window.location.origin ||
      (target.pathname !== "/admin" && !target.pathname.startsWith("/admin/"))) return;
    const navigate = () => {
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
    const event = new CustomEvent<AdminNavigationIntent>(ADMIN_NAVIGATION_INTENT_EVENT, {
      cancelable: true,
      detail: { href, navigate },
    });
    // A dirty editor may cancel navigation; keep this dialog and its search
    // results intact in that case, rather than closing and losing the query.
    if (!window.dispatchEvent(event)) return;
    changeOpen(false);
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
              onChange={event => {
                setQuery(event.target.value);
                setActive(0);
                const nextTerm = event.target.value.trim().slice(0, SEARCH_QUERY_MAX_LENGTH);
                // Extra characters after the server's limit (or harmless
                // surrounding whitespace) do not change the effective search.
                // Invalidate an in-flight response ONLY for a different term,
                // otherwise the unchanged request would be dropped forever.
                if (nextTerm !== searchTerm) {
                  searchGeneration.current += 1;
                  setRecords([]);
                  setLoading(shouldSearchRecords(nextTerm));
                  setSearchError("");
                  setIncomplete(false);
                }
              }}
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
                onMouseEnter={() => setActive(previous => previous === index ? previous : index)}
                onClick={() => go(item.href)}
              >
                <span><strong>{item.label}</strong><small>{item.category}{item.subtitle ? " · " + item.subtitle : ""}</small></span>
                <span className={styles.arrow} aria-hidden="true">↗</span>
              </button>
            )) : !loading && !searchError && !incomplete && <p className={styles.empty}>Takúto sekciu som nenašiel. Skús iné slovo.</p>}
          </div>
          {loading && <p className={styles.searchFeedback} role="status">Hľadám záznamy…</p>}
          {searchError && <p className={styles.searchFeedback} role="alert">{searchError}</p>}
          {incomplete && <p className={styles.searchFeedback} role="status">Niektoré zdroje sú dočasne nedostupné.</p>}
          {(searchError || incomplete) && shouldSearchRecords(searchTerm) && (
            <button type="button" className={styles.retry} onClick={retrySearch} disabled={loading}>Skúsiť vyhľadávanie znova</button>
          )}
          <div className={styles.footer}>↑ ↓ výber · Enter otvoriť · Esc zavrieť</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
