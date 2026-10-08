import type { MapViewport } from "./map-public-ui";

export type MapSheetState = "peek" | "preview" | "expanded";
export const MAP_RETURN_KEY = "psipedia-map-return-v3";

export function sheetStateAfterDrag(state: MapSheetState, delta: number, velocity: number, travel: number): MapSheetState {
  const threshold = Math.min(96, Math.max(40, travel * 0.16));
  if (state === "peek") {
    if (delta >= -threshold && velocity > -0.45) return "peek";
    return delta < -120 || velocity < -0.95 ? "expanded" : "preview";
  }
  if (state === "expanded") {
    if (delta <= threshold && velocity < 0.45) return "expanded";
    return delta > 120 || velocity > 0.95 ? "peek" : "preview";
  }
  if (delta > threshold || velocity > 0.45) return "peek";
  if (delta < -threshold || velocity < -0.45) return "expanded";
  return "preview";
}

export type MapReturnState = {
  filtersKey: string;
  viewport: MapViewport;
  selectedItemId: string | null;
  savedAt: number;
};

export function validMapReturnState(raw: string | null, key: string): MapReturnState | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const s = value as Partial<MapReturnState>;
    const v = s.viewport;
    const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n);
    if (s.filtersKey !== key || !finite(s.savedAt) || typeof s.savedAt !== "number"
      || s.savedAt > Date.now() || Date.now() - s.savedAt > 30 * 60 * 1000
      || !v?.center || !v.bbox || !finite(v.zoom) || v.zoom < 1 || v.zoom > 22
      || !finite(v.center.lat) || !finite(v.center.lng)
      || Math.abs(v.center.lat) > 90 || Math.abs(v.center.lng) > 180
      || !finite(v.bbox.north) || !finite(v.bbox.south)
      || !finite(v.bbox.east) || !finite(v.bbox.west)
      || v.bbox.north <= v.bbox.south || Math.abs(v.bbox.north) > 90
      || Math.abs(v.bbox.south) > 90 || Math.abs(v.bbox.east) > 180
      || Math.abs(v.bbox.west) > 180
      || !(s.selectedItemId === null
        || (typeof s.selectedItemId === "string" && s.selectedItemId.length < 161))) return null;
    return s as MapReturnState;
  } catch { return null; }
}

