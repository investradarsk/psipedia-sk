import type { EventType } from "@/lib/events";

/** One presentation contract for category navigation, legend and calendar dots. */
export const eventTypePresentation: Record<EventType, { label: string; color: string }> = {
  Výstava: { label: "Výstavy", color: "#EA8732" },
  Preteky: { label: "Preteky", color: "#258453" },
  Seminár: { label: "Semináre", color: "#AA7835" },
  Tréning: { label: "Tréningy", color: "#287FCA" },
  Stretnutie: { label: "Stretnutia", color: "#8954C5" },
  Iné: { label: "Ostatné", color: "#78838B" },
};
