import { Fragment, type HTMLAttributes, type ReactNode } from "react";
import styles from "./public-photo-gallery.module.css";
import { PublicPhotoSwipeEnhancer } from "./public-photoswipe-enhancer";
import { responsiveMediaSrcSet } from "@/lib/responsive-media";

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
            ? <img
                src={image.src}
                alt={image.alt}
                srcSet={responsiveMediaSrcSet(image.src, [320, 480, 640, 768, 960])}
                sizes="(max-width: 650px) calc((100vw - 40px) / 2), (max-width: 1250px) calc((100vw - 72px) / 3), 394px"
                width={1280}
                height={960}
                loading="lazy"
                decoding="async"
              />
            : <img
                src={image.src}
                alt={image.alt}
                srcSet={responsiveMediaSrcSet(image.src, [320, 480, 640, 768, 960, 1280])}
                sizes={variant === "breed"
                  ? "(max-width: 620px) calc(100vw - 32px), (max-width: 900px) 48vw, (max-width: 1280px) 31vw, 360px"
                  : image.size === "wide"
                    ? "(max-width: 680px) calc(100vw - 32px), (max-width: 1280px) calc(100vw - 64px), 1120px"
                    : "(max-width: 680px) calc(100vw - 32px), (max-width: 1280px) 48vw, 550px"}
                width={1280}
                height={960}
                loading="lazy"
                decoding="async"
              />;
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
            srcSet={responsiveMediaSrcSet(image.src, [160, 320, 480, 640, 768])}
            sizes="(max-width: 600px) calc((100vw - 40px) / 2), (max-width: 1250px) calc((100vw - 72px) / 3), 394px"
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
