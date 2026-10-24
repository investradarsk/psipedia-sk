import { PawMark } from "@/components/icons";
import styles from "./public-media-fallback.module.css";

/** A single, decorative default visual for public profiles without a photo. */
export function PublicMediaFallback({
  size = "thumbnail",
  label = "Fotografia zatiaľ nie je pridaná",
  className,
  appearance = "default",
  iconSize,
  decorative = false,
}: {
  size?: "thumbnail" | "detail";
  label?: string;
  className?: string;
  /** Context keeps the existing frame and icon size without adding another wrapper. */
  appearance?: "default" | "context";
  iconSize?: number;
  decorative?: boolean;
}) {
  return (
    <span
      className={[appearance === "default" ? styles.fallback : undefined, className]
        .filter(Boolean)
        .join(" ")}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
      data-public-media-fallback
      data-media-size={size}
    >
      <PawMark size={iconSize ?? (size === "detail" ? 64 : 30)} />
      {appearance === "default" && size === "detail" ? (
        <span className={styles.caption}>Fotografia sa pripravuje</span>
      ) : null}
    </span>
  );
}
