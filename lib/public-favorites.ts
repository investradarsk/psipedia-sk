export const FAVORITES_BATCH_SIZE = 40;

export function isFavoriteSlug(value: unknown): value is string {
  return typeof value === "string" && value.length <= 200 && value.trim().length > 0;
}

const STORAGE_KEY = "psipedia-favorites";
const CHANGE_EVENT = "psipedia-favorites-changed";

export function readFavorites(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(stored)) return [];
    return [...new Set(stored.filter(isFavoriteSlug))];
  } catch {
    return [];
  }
}

export function writeFavorites(slugs: string[]): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(slugs));
  } catch {
    return false;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return true;
}

export function subscribeFavorites(onChange: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key === STORAGE_KEY || event.key === null) onChange();
  }
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}
