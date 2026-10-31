import { Fragment, type HTMLAttributes, type ReactNode } from "react";
import styles from "./public-photo-gallery.module.css";
import { PublicPhotoSwipeEnhancer } from "./public-photoswipe-enhancer";

export type PublicPhotoGalleryImage = {
  src: string;
  alt: string;
  caption?: ReactNode;
  size?: string;
};

export function PublicPhotoGallery({
  images,
  variant = "linked",
  as: Tag = "div",
  renderImage,
  label = "Fotografie",
  fit = "contain",
  maxImages = 6,
  className,
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  images: PublicPhotoGalleryImage[];
  /** Preserved presentations: links for adoption, figures for breeds/editorial, plain report photos. */
  variant?: "linked" | "breed" | "editorial" | "report";
  as?: "div" | "section";
  renderImage?: (image: PublicPhotoGalleryImage, index: number) => ReactNode;
  label?: string;
  fit?: "contain" | "cover";
  maxImages?: number;
}) {
  const visible = variant === "linked"
    ? images.filter((image) => image.src.trim()).slice(0, Math.max(0, maxImages))
    : images.slice(0, Math.max(0, maxImages));
  if (!visible.length) return null;
  const gallery = (
    <Tag
      {...props}
      className={[variant === "linked" ? styles.gallery : styles[variant], className].filter(Boolean).join(" ")}
      role={Tag === "section" ? undefined : "group"}
      aria-label={label}
      data-public-photo-gallery
      data-photo-variant={variant}
      data-photo-fit={fit}
    >
      {visible.map((image, index) => {
        if (variant !== "linked") {
          const photo = renderImage ? renderImage(image, index) : variant === "report"
            ? <img src={image.src} alt={image.alt} />
            : <img src={image.src} alt={image.alt} loading="lazy" decoding="async" />;
          if (variant === "report") return <Fragment key={image.src + "-" + index}>{photo}</Fragment>;
          return (
            <figure key={image.src + "-" + index}
              className={variant === "editorial" ? `article-block-gallery-item article-block-gallery-item--${image.size ?? "normal"}` : undefined}
              data-photo-size={image.size ?? "normal"}>
              {photo}
              {image.caption ? <figcaption>{image.caption}</figcaption> : null}
            </figure>
          );
        }
        const href = /^(?:https?:\/\/|\/(?!\/))/i.test(image.src.trim()) ? image.src.trim() : null;
        const photo = (
          <img
            src={image.src}
            alt={image.alt}
            loading="lazy"
            decoding="async"
            width={640}
            height={480}
          />
        );
        return href ? (
          <a
            key={image.src + "-" + index}
            href={href}
            data-pswp-gallery-item
            data-pswp-width="1280"
            data-pswp-height="960"
            target="_blank"
            rel="noopener noreferrer"
            aria-label={image.alt ? `Otvoriť fotografiu: ${image.alt} (nové okno)` : `Otvoriť fotografiu ${index + 1} (nové okno)`}
          >
            {photo}
          </a>
        ) : <span key={image.src + "-" + index}>{photo}</span>;
      })}
    </Tag>
  );
  return variant === "linked" ? <PublicPhotoSwipeEnhancer>{gallery}</PublicPhotoSwipeEnhancer> : gallery;
}
