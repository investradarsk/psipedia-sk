"use client";

import { useState, type ImgHTMLAttributes } from "react";
import { SmartCardImage } from "@/components/smart-card-image";
import { responsiveMediaSrcSet } from "@/lib/responsive-media";
import { DEFAULT_DETAIL, DEFAULT_THUMBNAIL, legacyArticleThumbnail, legacyArticleDetail, type ImageDisplayConfig, type ImageDisplayContext } from "@/lib/image-display";
import type { SmartImageMode } from "@/lib/smart-image";
import styles from "./image-display.module.css";

type ImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt" | "onLoad">;
export type ImageDisplayProps = ImageProps & {
  src: string;
  alt: string;
  context: ImageDisplayContext;
  config?: ImageDisplayConfig | null;
  legacyMode?: SmartImageMode;
  legacyFocusX?: number | null;
  legacyFocusY?: number | null;
  className?: string;
  imageClassName?: string;
};

/** One renderer for the live editor and every public article image slot. */
export function ImageDisplay({
  src, alt, context, config, legacyMode, legacyFocusX, legacyFocusY,
  className, imageClassName, style, ...imageProps
}: ImageDisplayProps) {
  const [autoFit, setAutoFit] = useState<{ src: string; fit: "cover" | "contain" } | null>(null);
  const settings = config ?? (context === "thumbnail" ? legacyArticleThumbnail(legacyMode, legacyFocusX, legacyFocusY) : legacyArticleDetail(legacyMode, legacyFocusX, legacyFocusY))
    ?? (context === "thumbnail" ? DEFAULT_THUMBNAIL : DEFAULT_DETAIL);
  const natural = context === "detail" && settings.mode === "natural";
  const blur = settings.mode === "blur" || (settings.mode === "auto" && autoFit?.src === src && autoFit.fit === "contain");
  const focus = { x: settings.x, y: settings.y };
  const position = `${focus.x}% ${focus.y}%`;
  const cropTransform = { transform: `scale(${settings.zoom})`, transformOrigin: position };
  const fitMode: SmartImageMode = settings.mode === "auto" ? "auto" : settings.mode === "crop" ? "cover" : "contain";

  return (
    <span className={[styles.frame, natural && styles.natural, className].filter(Boolean).join(" ")}
      data-image-display={natural ? "natural" : blur ? "blur" : "crop"}>
      {natural ? (
        <img {...imageProps} src={src} alt={alt} className={[styles.naturalPhoto, imageClassName].filter(Boolean).join(" ")}
          style={style} draggable={false} />
      ) : (
        <>
          {blur && <img aria-hidden="true" alt="" src={src} srcSet={imageProps.srcSet ?? responsiveMediaSrcSet(src, [320, 640, 960])} sizes={imageProps.sizes ?? "100vw"}
            loading={imageProps.loading ?? "lazy"} decoding="async" className={styles.blurBackground} draggable={false} />}
          <SmartCardImage {...imageProps} src={src} alt={alt} roleHint="article" mode={fitMode}
            focusX={focus.x} focusY={focus.y}
            onResolvedFit={(fit) => setAutoFit((current) => current?.src === src && current.fit === fit ? current : { src, fit })}
            className={[styles.photo, imageClassName].filter(Boolean).join(" ")} draggable={false}
            style={{ ...style, ...cropTransform }} />
        </>
      )}
    </span>
  );
}
