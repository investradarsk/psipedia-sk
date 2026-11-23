"use client";

import { useState, useSyncExternalStore } from "react";
import { BookmarkIcon } from "./icons";
import { readFavorites, subscribeFavorites, writeFavorites } from "@/lib/public-favorites";
import utilityStyles from "./public-utility-action.module.css";

export function FavoriteButton({ slug, compact = false }: { slug: string; compact?: boolean }) {
  const [writeFailed, setWriteFailed] = useState(false);
  const saved = useSyncExternalStore(
    subscribeFavorites,
    () => readFavorites().includes(slug),
    () => false,
  );

  function toggle() {
    const current = readFavorites();
    const next = current.includes(slug)
      ? current.filter((item) => item !== slug)
      : [...current, slug];
    setWriteFailed(!writeFavorites(next));
  }

  const error = writeFailed ? "Zmenu obľúbených sa nepodarilo uložiť" : null;

  return (
    <>
      <button
        type="button"
        className={`${utilityStyles.utility} public-utility-action favorite-button ${compact ? "favorite-button--compact" : ""} ${saved ? "is-saved" : ""}`}
        onClick={toggle}
        aria-pressed={saved}
        aria-label={saved ? "Odstrániť z obľúbených" : "Uložiť medzi obľúbené"}
        title={error ?? (saved ? "Uložené" : "Uložiť článok")}
      >
        <BookmarkIcon filled={saved} />
        {!compact && <span>{error ?? (saved ? "Uložené" : "Uložiť")}</span>}
      </button>
      <span role="status" className="sr-only">
        {error}
      </span>
    </>
  );
}
