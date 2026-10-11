/** Lightweight, zero-API-cost presentation. Stored image files stay untouched. */
export type SmartImageMode = "auto" | "cover" | "contain";
export type SmartImageFit = Exclude<SmartImageMode, "auto">;

export type SmartImageRole = "generic" | "article";

export function normalizeImageFocus(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error("Bod zaostrenia obrázka musí byť číslo od 0 do 100.");
  }
  return Math.round(value);
}

/** A photo near the top of a landscape card should not have its head cropped by center positioning. */
export function articleFocalPosition(input: {
  focusX?: number | null;
  focusY?: number | null;
}): { x: number; y: number } {
  return {
    x: input.focusX ?? 50,
    y: input.focusY ?? 28,
  };
}

/** If the source is much squarer than the display slot, retaining the whole image is safer. */
export function avoidSevereArticleCrop(sourceRatio: number, slotRatio: number): boolean {
  return sourceRatio > 0 && slotRatio > 0 && (slotRatio / sourceRatio > 1.56 || sourceRatio / slotRatio > 1.82);
}

export function normalizeSmartImageMode(value: unknown): SmartImageMode {
  if (value === undefined || value === null || value === "") return "auto";
  if (value === "auto" || value === "cover" || value === "contain") return value;
  throw new Error("Spôsob zobrazenia obrázka nie je platný.");
}

/** Preserve artwork with extreme proportions, bright backgrounds, or a descriptive filename. */
export function inferSmartImageFit(input: {
  width: number;
  height: number;
  src?: string;
  lightBackgroundShare?: number;
}): SmartImageFit {
  const ratio = input.height > 0 ? input.width / input.height : 1;
  if (/(?:^|[\/_\.-])(logo|logotyp|plagat|plak[aá]t|poster|flyer|letak|let[aá]k|banner|baner)(?:[\/_\.-]|$)/i.test(input.src ?? "")) return "contain";
  if (ratio < 0.78 || ratio > 2.15) return "contain";
  if ((input.lightBackgroundShare ?? 0) >= 0.4) return "contain";
  return "cover";
}
