/**
 * Shared, non-destructive image presentation contract. NULL means automatic/default.
 * Values are normalized once at the API boundary and are never used as raw CSS.
 */
import type { SmartImageMode } from "./smart-image";

export type ImageDisplayContext = "thumbnail" | "detail";
export type ImageDisplayMode = "auto" | "crop" | "blur" | "natural";
export type ImageDisplayConfig = {
  mode: ImageDisplayMode;
  x: number;
  y: number;
  zoom: number;
};

/** Choose a thumbnail's default from intrinsic dimensions and actual card geometry.
 * Reuse the existing small light-background sample to preserve posters/logos.
 * A missing sample (e.g. cross-origin images without CORS) safely falls back to dimensions.
 */
export function automaticThumbnailFit(
  width: number, height: number, frameRatio: number, lightBackgroundShare?: number,
): "cover" | "contain" {
  if (!(width > 0 && height > 0 && frameRatio > 0)) return "cover";
  const sourceRatio = width / height;
  if (sourceRatio < 1 && frameRatio > 1.2) return "contain";
  if (frameRatio / sourceRatio > 1.56 || sourceRatio / frameRatio > 1.82) return "contain";
  if ((lightBackgroundShare ?? 0) >= 0.4) return "contain";
  return "cover";
}

export const DEFAULT_THUMBNAIL: ImageDisplayConfig = { mode: "auto", x: 50, y: 28, zoom: 1 };
export const DEFAULT_DETAIL: ImageDisplayConfig = { mode: "natural", x: 50, y: 50, zoom: 1 };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function normalizeImageDisplayConfig(value: unknown, context: ImageDisplayContext): ImageDisplayConfig | null {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Neplatné nastavenie zobrazenia obrázka.");
  }
  const input = value as Record<string, unknown>;
  const modes: readonly string[] = context === "thumbnail" ? ["auto", "crop", "blur"] : ["natural", "crop", "blur"];
  if (!modes.includes(input.mode as string)) throw new Error("Neplatný režim zobrazenia obrázka.");
  for (const key of ["x", "y", "zoom"] as const) {
    if (typeof input[key] !== "number" || !Number.isFinite(input[key])) {
      throw new Error("Pozícia a priblíženie obrázka musia byť konečné čísla.");
    }
  }
  const { x, y, zoom } = input as { x: number; y: number; zoom: number };
  return {
    mode: input.mode as ImageDisplayMode,
    x: Math.round(clamp(x, 0, 100) * 100) / 100,
    y: Math.round(clamp(y, 0, 100) * 100) / 100,
    zoom: Math.round(clamp(zoom, 1, 2.5) * 100) / 100,
  };
}

/** Guard against malformed historical JSON without crashing public rendering. */
export function readImageDisplayConfig(value: unknown, context: ImageDisplayContext): ImageDisplayConfig | null {
  if (value == null || value === "") return null;
  try {
    return normalizeImageDisplayConfig(typeof value === "string" ? JSON.parse(value) : value, context);
  } catch {
    return null;
  }
}

/** The 0120 focal-point contract remains readable until the editor intentionally replaces it. */
/** Preserve old card/hero preferences for existing articles when no new detail override exists. */
export function legacyArticleDetail(
  mode?: SmartImageMode,
  focusX?: number | null,
  focusY?: number | null,
): ImageDisplayConfig | null {
  if ((mode == null || mode === "auto") && focusX == null && focusY == null) return null;
  return {
    mode: mode === "contain" ? "blur" : "crop",
    x: focusX ?? 50,
    y: focusY ?? 28,
    zoom: 1,
  };
}

export function legacyArticleThumbnail(
  mode?: SmartImageMode,
  focusX?: number | null,
  focusY?: number | null,
): ImageDisplayConfig | null {
  if ((mode == null || mode === "auto") && focusX == null && focusY == null) return null;
  return {
    mode: mode === "cover" ? "crop" : mode === "contain" ? "blur" : "auto",
    x: focusX ?? 50,
    y: focusY ?? 28,
    zoom: 1,
  };
}
