"use client";

import { useState, type ImgHTMLAttributes } from "react";
import { SmartCardImage } from "@/components/smart-card-image";
import { getEventFallbackImage, getEventOwnImage, eventTypePresentation } from "@/lib/event-type-presentation";
import type { EventType } from "@/lib/events";
import type { SmartImageMode } from "@/lib/smart-image";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet" | "onError"> & {
  imageUrl: string | null;
  eventType: EventType;
  mode?: SmartImageMode;
};

/** Event-only failure handling. The initial image is selected during SSR. */
export function EventImage({ imageUrl, eventType, mode, alt, ...props }: Props) {
  const ownImage = getEventOwnImage(imageUrl);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const real = Boolean(ownImage && failedSource !== ownImage);
  const src = real ? ownImage! : getEventFallbackImage(eventType);
  const imageProps = {
    ...props,
    src,
    alt: real ? alt : alt === "" ? "" : `Ilustračný obrázok – ${eventTypePresentation[eventType].label.toLocaleLowerCase("sk")}`,
    width: 1280,
    height: 800,
    "data-event-image-source": real ? "real" : "fallback",
    onError: () => {
      if (real) {
        console.warn("Event photograph failed to load; displaying category illustration.");
        setFailedSource(src);
      }
    },
  };
  return real ? <SmartCardImage {...imageProps} mode={mode} /> : (
    // Optimized local artwork intentionally skips smart image analysis.
    // eslint-disable-next-line @next/next/no-img-element
    <img {...imageProps} alt={imageProps.alt} style={{ ...props.style, objectFit: "cover" }} />
  );
}
