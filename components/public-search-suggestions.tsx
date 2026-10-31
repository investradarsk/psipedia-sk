"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";
import type { PublicSearchSuggestionGroup } from "@/lib/portal-search-suggestions";
import { ArrowIcon, SearchIcon } from "@/components/icons";
import styles from "./public-search-suggestions.module.css";

type SearchResponse = { groups?: PublicSearchSuggestionGroup[]; total?: number };
type SearchState = {
  query: string;
  groups: PublicSearchSuggestionGroup[];
  total: number;
  status: "idle" | "loading" | "ready" | "error";
};

/**
 * cmdk-style grouped command menu, backed by Psipedia's real public search.
 * Deliberately retains the native GET forms, keyboard focus and canonical links.
 */
export function PublicSearchSuggestions({
  query,
  enabled = true,
  mode = "modal",
  inputRef,
  onNavigate,
}: {
  query: string;
  enabled?: boolean;
  mode?: "modal" | "home";
  inputRef: RefObject<HTMLInputElement | null>;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const componentId = useId();
  const normalizedQuery = query.trim().slice(0, 120);
  const [state, setState] = useState<SearchState>({
    query: "",
    groups: [],
    total: 0,
    status: "idle",
  });
  const [selection, setSelection] = useState({ query: "", index: -1 });
  const [dismissedFor, setDismissedFor] = useState("");
  const selected = selection.query === normalizedQuery ? selection.index : -1;
  const cacheRef = useRef(new Map<string, SearchResponse>());

  useEffect(() => {
    if (!enabled || normalizedQuery.length < 2) return;
    const cached = cacheRef.current.get(normalizedQuery);
    if (cached) {
      const timer = window.setTimeout(() => {
        setState({ query: normalizedQuery, groups: cached.groups ?? [], total: cached.total ?? 0, status: "ready" });
      }, 0);
      return () => window.clearTimeout(timer);
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setState({ query: normalizedQuery, groups: [], total: 0, status: "loading" });
      try {
        const response = await fetch(
          `/api/public/search/suggestions?q=${encodeURIComponent(normalizedQuery)}`,
          { signal: controller.signal, cache: "no-store" },
        );
        if (!response.ok) throw new Error("Suggestion request failed");
        const payload = await response.json() as SearchResponse;
        if (controller.signal.aborted) return;
        if (!Array.isArray(payload.groups)) throw new Error("Invalid suggestion payload");
        const safePayload = { groups: payload.groups, total: Math.max(0, payload.total ?? 0) };
        cacheRef.current.set(normalizedQuery, safePayload);
        if (cacheRef.current.size > 30) cacheRef.current.delete(cacheRef.current.keys().next().value ?? "");
        setState({ query: normalizedQuery, groups: safePayload.groups, total: safePayload.total, status: "ready" });
      } catch {
        if (!controller.signal.aborted) {
          setState({ query: normalizedQuery, groups: [], total: 0, status: "error" });
        }
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [normalizedQuery, enabled]);

  const groups = useMemo(
    () => state.query === normalizedQuery ? state.groups : [],
    [state.query, state.groups, normalizedQuery],
  );
  const status = state.query === normalizedQuery ? state.status : "loading";
  const suggestions = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const listId = `ps-search-${componentId}`;
  const isOpen = enabled && normalizedQuery.length >= 2 && dismissedFor !== normalizedQuery;

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    // Attach to the existing forms instead of replacing their native submit behavior.
    // Keep the native textbox role: existing header keyboard and accessibility
    // contracts locate this control as a textbox, not a combobox.
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", listId);
    // Native textbox inputs do not support aria-expanded (axe aria-allowed-attr).
    // Keep textbox semantics for the existing search forms and expose the
    // listbox via aria-controls + aria-activedescendant instead.
    input.removeAttribute("aria-expanded");
    if (isOpen && selected >= 0 && selected < suggestions.length) {
      input.setAttribute("aria-activedescendant", `${listId}-item-${selected}`);
    } else {
      input.removeAttribute("aria-activedescendant");
    }
    return () => {
      input.removeAttribute("aria-activedescendant");
    };
  }, [inputRef, listId, isOpen, selected, suggestions.length]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input || !enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && mode === "home") {
        setDismissedFor(normalizedQuery);
        return;
      }
      if (!isOpen || status !== "ready" || !suggestions.length) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setSelection((current) => {
          const index = current.query === normalizedQuery ? current.index : -1;
          return { query: normalizedQuery, index: event.key === "ArrowDown"
            ? (index + 1) % suggestions.length
            : (index - 1 + suggestions.length) % suggestions.length };
        });
      } else if (event.key === "Enter" && selected >= 0 && suggestions[selected]) {
        event.preventDefault();
        const destination = suggestions[selected].href;
        if (destination.startsWith("/") && !destination.startsWith("//")) {
          onNavigate?.();
          router.push(destination);
        }
      }
    };
    input.addEventListener("keydown", onKeyDown);
    return () => input.removeEventListener("keydown", onKeyDown);
  }, [inputRef, enabled, isOpen, status, suggestions, selected, router, mode, onNavigate, normalizedQuery]);

  if (!enabled) return null;
  if (normalizedQuery.length < 2) {
    if (mode !== "modal") return null;
    return (
      <div className={styles.quickLinks} aria-label="Rýchle odkazy">
        <p>Začni písať alebo otvor niektorú sekciu</p>
        <div>
          {[
            { href: "/plemena", label: "Plemená" },
            { href: "/adresar/veterinari", label: "Veterinári" },
            { href: "/podujatia", label: "Podujatia" },
            { href: "/pomoc-psom", label: "Pomoc psom" },
          ].map((item) => (
            <Link key={item.href} href={item.href} onClick={onNavigate}>{item.label}</Link>
          ))}
        </div>
      </div>
    );
  }
  if (dismissedFor === normalizedQuery) return null;

  let cursor = 0;
  return (
    <div className={mode === "home" ? styles.homePanel : styles.modalPanel} data-public-live-search aria-live="polite">
      {status === "loading" ? <p className={styles.info}>Hľadám na Psipedii…</p> : null}
      {status === "error" ? <p className={styles.info}>Návrhy sa nepodarilo načítať. Použi Hľadať pre všetky výsledky.</p> : null}
      {status === "ready" && !suggestions.length
        ? <p className={styles.info}>Zatiaľ bez priamej zhody. Skús celý výsledkový zoznam.</p>
        : null}
      {status === "ready" && suggestions.length > 0 ? (
        <div id={listId} role="listbox" aria-label="Návrhy vyhľadávania" className={styles.list}>
          {groups.map((group) => (
            <div key={group.id} role="group" aria-label={group.label} className={styles.group}>
              <div className={styles.groupTitle}>{group.label}</div>
              {group.items.map((item) => {
                const index = cursor++;
                return (
                  <Link
                    key={item.href}
                    id={`${listId}-item-${index}`}
                    role="option"
                    aria-selected={selected === index}
                    className={styles.option}
                    data-active={selected === index}
                    href={item.href}
                    onMouseEnter={() => setSelection({ query: normalizedQuery, index })}
                    onClick={onNavigate}
                  >
                    <span className={styles.optionIcon}><SearchIcon size={15} /></span>
                    <span className={styles.optionText}>
                      <strong>{item.title}</strong>
                      <small>{[item.type, item.city].filter(Boolean).join(" · ")}{item.description ? ` — ${item.description}` : ""}</small>
                    </span>
                    <ArrowIcon size={17} />
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
      <Link
        href={`/hladat?q=${encodeURIComponent(normalizedQuery)}`}
        className={styles.allResults}
        onClick={onNavigate}
      >
        <span>Zobraziť všetky výsledky pre „{normalizedQuery}“</span>
        <ArrowIcon size={17} />
      </Link>
      {mode === "modal" ? <p className={styles.keyboardHint}>↑ ↓ výber · Enter otvoriť · Esc zavrieť</p> : null}
    </div>
  );
}
