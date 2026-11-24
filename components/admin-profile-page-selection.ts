"use client";

import { useState, type SetStateAction } from "react";

/** A selection belongs to a single filtered, paginated view, never to a new one. */
export function useAdminProfilePageSelection(viewKey: string, visibleIds: readonly number[]) {
  const [selection, setSelection] = useState<{ key: string; ids: Set<number> }>({ key: "", ids: new Set() });
  const visible = new Set(visibleIds);
  const current = selection.key === viewKey
    ? new Set([...selection.ids].filter((id) => visible.has(id)))
    : new Set<number>();
  function setSelected(next: SetStateAction<Set<number>>) {
    setSelection((previous) => {
      const prior = previous.key === viewKey
        ? new Set([...previous.ids].filter((id) => visible.has(id)))
        : new Set<number>();
      const requested = typeof next === "function" ? next(prior) : next;
      return { key: viewKey, ids: new Set([...requested].filter((id) => visible.has(id))) };
    });
  }
  return [current, setSelected] as const;
}
