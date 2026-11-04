import type { HTMLAttributes } from "react";
import styles from "./public-heading.module.css";

export type PublicHeadingRole = "page" | "section" | "panel" | "eyebrow";
/** Semantic level is independent of its visual role. */
export function PublicHeading({
  as,
  role = "section",
  className,
  ...props
}: Omit<HTMLAttributes<HTMLHeadingElement>, "role"> & {
  as?: "h1" | "h2" | "h3" | "h4";
  role?: PublicHeadingRole;
}) {
  const Tag = as ?? (role === "page" ? "h1" : "h2");
  return (
    <Tag
      {...props}
      className={[styles.heading, className].filter(Boolean).join(" ")}
      data-public-heading
      data-heading-role={role}
    />
  );
}
