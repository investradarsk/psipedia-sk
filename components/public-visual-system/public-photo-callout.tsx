import { PublicMagazineBanner } from "./public-magazine-banner";
import type { ComponentProps } from "react";

/**
 * Help photo CTAs use the exact homepage banner layout, spacing and action.
 * Only their content and photograph change, never their structural component.
 */
export type PublicPhotoCalloutData = {
  eyebrow: string;
  title: string;
  text: string;
  href: string;
  action: string;
  tone: "care" | "rescue" | "volunteer" | "closing";
};

export function PublicPhotoCallout({
  promo,
  headingId,
  anchorId,
  desktopColors,
  desktopCopy,
}: {
  promo: PublicPhotoCalloutData;
  headingId?: string;
  anchorId?: string;
  desktopColors?: ComponentProps<typeof PublicMagazineBanner>["desktopColors"];
  desktopCopy?: ComponentProps<typeof PublicMagazineBanner>["desktopCopy"];
}) {
  return (
    <PublicMagazineBanner
      anchorId={anchorId}
      desktopColors={desktopColors}
      desktopCopy={desktopCopy}
      eyebrow={promo.eyebrow}
      title={promo.title}
      description={promo.text}
      label={promo.action}
      href={promo.href}
      testId={`help-${promo.tone}`}
      photoTone={promo.tone}
      headingId={headingId}
    />
  );
}
