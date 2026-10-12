"use client";

import { useState, type ImgHTMLAttributes } from "react";
import { SmartCardImage } from "@/components/smart-card-image";
import {
  DEFAULT_DETAIL, DEFAULT_THUMBNAIL, automaticThumbnailFit,
  legacyArticleThumbnail, legacyArticleDetail,
  type ImageDisplayConfig, type ImageDisplayContext,
} from "@/lib/image-display";
import type { SmartImageMode, SmartImageRole } from "@/lib/smart-image";
import styles from "./image-display.module.css";

type ImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt" | "onLoad">;
export type ImageDisplayProps = ImageProps & {
  src: string;
  alt: string;
  context: ImageDisplayContext;
  config?: ImageDisplayConfig | null;
  legacyMode?: SmartImageMode;
  roleHint?: SmartImageRole;
  legacyFocusX?: number | null;
  legacyFocusY?: number | null;
  className?: string;
  imageClassName?: string;
};

/** Non-destructive renderer shared by the live editor and public image slots. */
export function ImageDisplay({
  src, alt, context, config, legacyMode, legacyFocusX, legacyFocusY, roleHint = "article",
  className, imageClassName, style, ...imageProps
}: ImageDisplayProps) {
  const [autoFit, setAutoFit] = useState<{ src: string; fit: "cover" | "contain" } | null>(null);
  const settings = config ?? (context === "thumbnail"
    ? legacyArticleThumbnail(legacyMode, legacyFocusX, legacyFocusY)
    : legacyArticleDetail(legacyMode, legacyFocusX, legacyFocusY))
    ?? (context === "thumbnail" ? DEFAULT_THUMBNAIL : DEFAULT_DETAIL);
  const natural = context === "detail" && settings.mode === "natural";
  // Dimension detection is intentionally performed after image load; SSR renders the
  // same stable crop frame as the initial client render, avoiding hydration mismatch.
  const resolvedFit = autoFit?.src === src ? autoFit.fit : "cover";
  const blur = settings.mode === "blur" || (settings.mode === "auto" && resolvedFit === "contain");
  const position = `${settings.x}% ${settings.y}%`;
  const cropTransform = { transform: `scale(${settings.zoom})`, transformOrigin: position };
  const fitMode: SmartImageMode = settings.mode === "auto" ? resolvedFit
    : settings.mode === "crop" ? "cover" : "contain";

  return (
    <span className={[styles.frame, natural && styles.natural, className].filter(Boolean).join(" ")}
      data-image-display={natural ? "natural" : blur ? "blur" : "crop"}>
      {natural ? (
        <img {...imageProps} src={src} alt={alt} className={[styles.naturalPhoto, imageClassName].filter(Boolean).join(" ")}
          style={style} draggable={false} />
      ) : (
        <>
          {blur && <img className={styles.blurBackground} src={src} srcSet={imageProps.srcSet}
            sizes={imageProps.sizes} loading={imageProps.loading} decoding={imageProps.decoding}
            alt="" aria-hidden="true" draggable={false} />}
          <SmartCardImage {...imageProps} src={src} alt={alt} roleHint={roleHint} mode={fitMode}
            focusX={settings.x} focusY={settings.y}
            onImageDimensions={settings.mode === "auto" ? ({ width, height, frameRatio }) => {
              const fit = automaticThumbnailFit(width, height, frameRatio);
              setAutoFit((current) => current?.src === src && current.fit === fit ? current : { src, fit });
            } : undefined}
            className={[styles.photo, imageClassName].filter(Boolean).join(" ")} draggable={false}
            style={{ ...style, ...cropTransform }} />
        </>
      )}
    </span>
  );
}
