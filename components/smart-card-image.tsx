"use client";

import { useState, type ImgHTMLAttributes, type SyntheticEvent } from "react";
import { inferSmartImageFit, type SmartImageFit, type SmartImageMode } from "@/lib/smart-image";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "onLoad"> & { mode?: SmartImageMode };

/** Inspect a tiny browser-rendered sample; safe dimension fallback for CORS-blocked sources. */
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
    // Images from remote sites may taint the canvas. Do not add network calls.
    return undefined;
  }
}

/** Inline fit takes precedence over legacy CSS cover; card dimensions remain unchanged. */
export function SmartCardImage({ mode = "auto", src, style, ...rest }: Props) {
  const [analyzed, setAnalyzed] = useState<{ src: string; fit: SmartImageFit } | null>(null);
  const key = typeof src === "string" ? src : "";
  const fit: SmartImageFit = mode !== "auto" ? mode : analyzed?.src === key ? analyzed.fit : "contain";

  function onLoad(event: SyntheticEvent<HTMLImageElement>) {
    if (mode !== "auto") return;
    const image = event.currentTarget;
    const next = inferSmartImageFit({
      width: image.naturalWidth,
      height: image.naturalHeight,
      src: key,
      lightBackgroundShare: sampleLightBackground(image),
    });
    setAnalyzed((prev) => prev?.src === key && prev.fit === next ? prev : { src: key, fit: next });
  }

  return <img {...rest} src={src} onLoad={onLoad} style={{ ...style, objectFit: fit }} data-smart-image-fit={fit} />;
}
