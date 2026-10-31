import type { VisualBanner } from "@/lib/visual-library-banners";

/** Unpublished editor draft. Neither public data nor database writes use this type. */
export type BannerDraft = {
  eyebrow: string;
  title: string;
  description: string;
  ctaLabel: string;
  background: "original" | "sage" | "cream" | "white";
  button: "original" | "green" | "red";
  scope: "one" | "template";
};

export const BANNER_DRAFT_STORAGE_PREFIX = "psipedia:visual-library:draft:v1:";

export function defaultBannerDraft(banner: VisualBanner, variantIndex: number): BannerDraft {
  const variant = banner.variants?.[variantIndex];
  return {
    eyebrow: variant?.eyebrow ?? banner.eyebrow,
    title: variant?.title ?? banner.title,
    description: variant?.description ?? banner.description,
    ctaLabel: variant?.ctaLabel ?? banner.ctaLabel,
    background: "original",
    button: "original",
    scope: "one",
  };
}

export function validateBannerDraft(raw: unknown, fallback: BannerDraft): BannerDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Record<string, unknown>;
  const read = (name: keyof BannerDraft, limit: number) =>
    typeof input[name] === "string" && (input[name] as string).trim().length > 0 &&
    (input[name] as string).length <= limit && !/[\u0000-\u001f\u007f]/.test(input[name] as string)
      ? (input[name] as string).trim() : null;
  const eyebrow = read("eyebrow", 100);
  const title = read("title", 140);
  const description = read("description", 360);
  const ctaLabel = read("ctaLabel", 80);
  if (!eyebrow || !title || !description || !ctaLabel) return null;
  return {
    eyebrow, title, description, ctaLabel,
    background: ["original", "sage", "cream", "white"].includes(String(input.background))
      ? input.background as BannerDraft["background"] : fallback.background,
    button: ["original", "green", "red"].includes(String(input.button))
      ? input.button as BannerDraft["button"] : fallback.button,
    scope: input.scope === "template" ? "template" : "one",
  };
}
