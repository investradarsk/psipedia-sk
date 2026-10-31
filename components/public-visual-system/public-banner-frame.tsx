import type { HTMLAttributes, ReactNode } from "react";

/**
 * Single semantic root for every public promotional or contextual banner.
 * Keeps the exact section/aside markup and existing per-variant CSS classes;
 * this component owns only the shared frame class and identification.
 *
 * Do not set banner geometry here: the established design tokens own that,
 * and individual variants retain their approved desktop/mobile composition.
 */
export function PublicBannerFrame({
  as: Element = "aside",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: "section" | "aside";
  children: ReactNode;
}) {
  return (
    <Element
      {...props}
      className={["ps-public-banner-frame", className].filter(Boolean).join(" ")}
      data-public-banner-frame
    >
      {children}
    </Element>
  );
}
