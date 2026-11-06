"use client";

import { responsiveMediaSrcSet } from "@/lib/responsive-media";
import { useState, type ImgHTMLAttributes } from "react";
import { ImageDisplay } from "@/components/image-display";
import type { ImageDisplayConfig, ImageDisplayContext } from "@/lib/image-display";
import {
  getEventFallbackImage,
  getEventFallbackSrcSet,
  getEventOwnImage,
  eventTypePresentation,
} from "@/lib/event-type-presentation";
import type { EventType } from "@/lib/events";
import type { SmartImageMode } from "@/lib/smart-image";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet" | "onError"> & {
  imageUrl: string | null;
  /** When a third-party photo fails in the browser, try the safe same-origin event relay. */
  eventId?: number;
  eventType: EventType;
  mode?: SmartImageMode;
  context?: ImageDisplayContext;
  config?: ImageDisplayConfig | null;
};

/** Event-only failure handling. The initial image is selected during SSR. */
export function EventImage({
  imageUrl,
  eventId,
  eventType,
  mode,
  context = "thumbnail",
  config,
  alt,
  ...props
}: Props) {
  const ownImage = getEventOwnImage(imageUrl);
  // Keep failure state tied to the exact URL so a new event/photo is never stuck
  // displaying the previous event's illustration.
  const [attempt, setAttempt] = useState<{
    source: string;
    stage: "original" | "proxy" | "fallback";
  } | null>(null);
  const stage = attempt?.source === ownImage ? attempt.stage : "primary";
  const remote = Boolean(ownImage && /^https?:\/\//i.test(ownImage));
  const proxy = remote && Number.isSafeInteger(eventId) && (eventId ?? 0) > 0
    ? `/api/public/events/image/${eventId}`
    : null;
  const real = Boolean(ownImage && stage !== "fallback");
  const src = stage === "proxy" && proxy ? proxy : real ? ownImage! : getEventFallbackImage(eventType);
  const imageProps = {
    ...props,
    src,
    // A failed resized R2 variant must not hide a working original.
    srcSet: real && stage === "primary" ? responsiveMediaSrcSet(src, [320, 480, 640, 768, 960, 1280]) : undefined,
    alt: real
      ? alt
      : alt === ""
        ? ""
        : `Ilustračný obrázok – ${eventTypePresentation[eventType].label.toLocaleLowerCase("sk")}`,
    width: 1280,
    height: 800,
    "data-event-image-source": real ? "real" : "fallback",
    onImageFailure: () => {
      if (!real || !ownImage) return;
      if (stage === "primary") {
        // Retry the canonical URL without responsive candidates. On external
        // hosts, the retry also omits Referer to handle hotlink restrictions.
        setAttempt({ source: ownImage, stage: "original" });
        return;
      }
      if (stage === "original" && proxy) {
        // Some providers allow direct navigation but block hotlinked <img>
        // elements. Relay only a published event's stored source, not a URL
        // supplied by the browser. The endpoint validates size and type.
        setAttempt({ source: ownImage, stage: "proxy" });
        return;
      }
      console.warn("Event photograph failed to load even after original retry; displaying category illustration.");
      setAttempt({ source: ownImage, stage: "fallback" });
    },
  };
  return real ? (
    <ImageDisplay
      key={`${src}:${stage}`}
      roleHint="generic"
      {...imageProps}
      referrerPolicy={remote ? "no-referrer" : props.referrerPolicy}
      src={src}
      alt={imageProps.alt ?? ""}
      context={context}
      config={config}
      legacyMode={mode}
    />
  ) : (
    // Optimized local artwork intentionally skips smart image analysis.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      src={src}
      width={1280}
      height={800}
      data-event-image-source="fallback"
      srcSet={getEventFallbackSrcSet(eventType)}
      sizes={props.sizes ?? "(max-width: 760px) calc(100vw - 32px), (max-width: 1199px) 50vw, 33vw"}
      alt={imageProps.alt}
      style={{ ...props.style, objectFit: "cover" }}
    />
  );
}
