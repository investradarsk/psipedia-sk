import type { HTMLAttributes } from "react";
import styles from "./public-photo-gallery.module.css";

export type PublicPhotoGalleryImage = {
  src: string;
  alt: string;
};

export function PublicPhotoGallery({
  images,
  label = "Fotografie",
  fit = "contain",
  maxImages = 6,
  className,
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  images: PublicPhotoGalleryImage[];
  label?: string;
  fit?: "contain" | "cover";
  maxImages?: number;
}) {
  const visible = images.filter((image) => image.src.trim()).slice(0, Math.max(0, maxImages));
  if (!visible.length) return null;
  return (
    <div
      {...props}
      className={[styles.gallery, className].filter(Boolean).join(" ")}
      role="group"
      aria-label={label}
      data-public-photo-gallery
      data-photo-fit={fit}
    >
      {visible.map((image, index) => (
        <a
          key={image.src + "-" + index}
          href={image.src}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={image.alt ? `Otvoriť fotografiu: ${image.alt} (nové okno)` : `Otvoriť fotografiu ${index + 1} (nové okno)`}
        >
          <img
            src={image.src}
            alt={image.alt}
            loading="lazy"
            decoding="async"
            width={640}
            height={480}
          />
        </a>
      ))}
    </div>
  );
}
