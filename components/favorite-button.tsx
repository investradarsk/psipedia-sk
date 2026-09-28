"use client";

import { useSyncExternalStore } from "react";
import { BookmarkIcon } from "./icons";

const STORAGE_KEY = "psipedia-favorites";

function readFavorites(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function FavoriteButton({ slug, compact = false }: { slug: string; compact?: boolean }) {
  const saved = useSyncExternalStore(
    (onChange) => {
      window.addEventListener("psipedia-favorites-changed", onChange);
      window.addEventListener("storage", onChange);
      return () => {
        window.removeEventListener("psipedia-favorites-changed", onChange);
        window.removeEventListener("storage", onChange);
      };
    },
    () => readFavorites().includes(slug),
    () => false,
  );

  function toggle() {
    const current = readFavorites();
    const next = current.includes(slug)
      ? current.filter((item) => item !== slug)
      : [...current, slug];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("psipedia-favorites-changed"));
  }

  return (
    <button
      type="button"
      className={`favorite-button ${compact ? "favorite-button--compact" : ""} ${saved ? "is-saved" : ""}`}
      onClick={toggle}
      aria-pressed={saved}
      aria-label={saved ? "Odstrániť z obľúbených" : "Uložiť medzi obľúbené"}
      title={saved ? "Uložené" : "Uložiť článok"}
    >
      <BookmarkIcon filled={saved} />
      {!compact && <span>{saved ? "Uložené" : "Uložiť"}</span>}
    </button>
  );
}

export { STORAGE_KEY };
