"use client";

import { useState, type ImgHTMLAttributes, type SyntheticEvent } from "react";
import {
  articleFocalPosition,
  avoidSevereArticleCrop,
  inferSmartImageFit,
  type SmartImageFit,
  type SmartImageMode,
  type SmartImageRole,
} from "@/lib/smart-image";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "onLoad"> & {
  mode?: SmartImageMode;
  roleHint?: SmartImageRole;
  focusX?: number | null;
  focusY?: number | null;
};

/** Inspect a small canvas sample. Cross-origin images without CORS use dimension-based fallback. */
function sampleLightBackground(image: HTMLImageElement): number | undefined {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 40;
    canvas.height = 40;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return undefined;
    context.drawImage(image, 0, 0, 40, 40);
    const data = context.getImageData(0, 0, 40, 40).data;
    let paper = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a < 220 || (r > 232 && g > 232 && b > 232 && Math.max(r, g, b) - Math.min(r, g, b) < 22)) paper++;
    }
    return paper / 1600;
  } catch {
    return undefined;
  }
}

/**
 * Article images prefer a top-biased crop rather than cutting heads at center.
 * Extreme mismatches become "contain" to avoid losing substantial photo content.
 * This does not claim AI face detection; editors may override fit and focal position.
 */
export function SmartCardImage({
  mode = "auto",
  roleHint = "generic",
  focusX = null,
  focusY = null,
  src,
  style,
  ...rest
}: Props) {
  const [analyzed, setAnalyzed] = useState<{ src: string; fit: SmartImageFit } | null>(null);
  const key = typeof src === "string" ? src : "";
  const initialFit: SmartImageFit = roleHint === "article" ? "cover" : "contain";
  const fit: SmartImageFit = mode !== "auto" ? mode : analyzed?.src === key ? analyzed.fit : initialFit;
  const focus = roleHint === "article" ? articleFocalPosition({ focusX, focusY }) : {
    x: focusX ?? 50,
    y: focusY ?? 50,
  };

  function onLoad(event: SyntheticEvent<HTMLImageElement>) {
    if (mode !== "auto") return;
    const image = event.currentTarget;
    const sourceRatio = image.naturalWidth / Math.max(1, image.naturalHeight);
    const parent = image.parentElement;
    const slotRatio = parent && parent.clientHeight > 0
      ? parent.clientWidth / parent.clientHeight : 16 / 9;
    const nextFit = inferSmartImageFit({
      width: image.naturalWidth,
      height: image.naturalHeight,
      src: key,
      lightBackgroundShare: sampleLightBackground(image),
    });
    const next = roleHint === "article" && nextFit === "cover" && avoidSevereArticleCrop(sourceRatio, slotRatio)
      ? "contain" : nextFit;
    setAnalyzed((previous) => previous?.src === key && previous.fit === next
      ? previous : { src: key, fit: next });
  }

  return <img
    {...rest}
    src={src}
    onLoad={onLoad}
    data-smart-image-fit={fit}
    style={{ ...style, objectFit: fit, objectPosition: `${focus.x}% ${focus.y}%` }}
  />;
}
