import type { HTMLAttributes, ReactNode } from "react";

export type PublicBannerVisual = "light" | "dark";
export type PublicBannerSize = "small" | "medium" | "large";

/**
 * Single semantic root for every public promotional or contextual banner.
 * Preserves semantic section/aside markup while exposing the shared two-theme,
 * three-size presentation contract to all public editorial banner adapters.
 * Appearance is defined once in app/banner-visuals.css; content and links stay local.
 */
export function PublicBannerFrame({
  as: Element = "aside",
  className,
  children,
  visual = "light",
  size = "medium",
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: "section" | "aside";
  children: ReactNode;
  visual?: PublicBannerVisual;
  size?: PublicBannerSize;
}) {
  return (
    <Element
      {...props}
      className={["ps-public-banner-frame", className].filter(Boolean).join(" ")}
      data-public-banner-frame
      data-banner-visual={visual}
      data-banner-size={size}
    >
      {children}
    </Element>
  );
}
