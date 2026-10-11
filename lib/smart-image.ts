/** Lightweight, zero-API-cost presentation. Stored image files stay untouched. */
export type SmartImageMode = "auto" | "cover" | "contain";
export type SmartImageFit = Exclude<SmartImageMode, "auto">;

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
