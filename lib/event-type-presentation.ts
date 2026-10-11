import type { EventType } from "@/lib/events";

/** One presentation contract for category navigation, legend and calendar dots. */
export const eventTypePresentation: Record<EventType, { label: string; color: string; fallbackImage: string }> = {
  Výstava: { label: "Výstavy", color: "#EA8732", fallbackImage: "/images/events/defaults/vystavy.webp" },
  Preteky: { label: "Preteky", color: "#258453", fallbackImage: "/images/events/defaults/preteky.webp" },
  Seminár: { label: "Semináre", color: "#AA7835", fallbackImage: "/images/events/defaults/seminare.webp" },
  Tréning: { label: "Tréningy", color: "#287FCA", fallbackImage: "/images/events/defaults/treningy.webp" },
  Stretnutie: { label: "Stretnutia", color: "#8954C5", fallbackImage: "/images/events/defaults/stretnutia.webp" },
  Iné: { label: "Ostatné", color: "#78838B", fallbackImage: "/images/events/defaults/ostatne.webp" },
};

/** Display-only artwork; never write this URL to event data or SEO. */
export function getEventFallbackImage(eventType: EventType): string {
  return eventTypePresentation[eventType].fallbackImage;
}

export function getEventOwnImage(imageUrl: string | null | undefined): string | null {
  const value = imageUrl?.trim();
  if (!value || /[\\\u0000-\u001f]/.test(value)) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? value : null;
  } catch { return null; }
}
