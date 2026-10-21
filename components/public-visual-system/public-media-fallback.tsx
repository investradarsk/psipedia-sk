import { PawMark } from "@/components/icons";
import styles from "./public-media-fallback.module.css";

/** A single, decorative default visual for public profiles without a photo. */
export function PublicMediaFallback({
  size = "thumbnail",
  label = "Fotografia zatiaľ nie je pridaná",
  className,
}: {
  size?: "thumbnail" | "detail";
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={[styles.fallback, className].filter(Boolean).join(" ")}
      role="img"
      aria-label={label}
      data-public-media-fallback
      data-media-size={size}
    >
      <PawMark size={size === "detail" ? 64 : 30} />
      {size === "detail" ? <span className={styles.caption}>Fotografia sa pripravuje</span> : null}
    </span>
  );
}
