"use client";

import { useState, type ReactNode } from "react";
import styles from "./events-public.module.css";

type BrowseMode = "both" | "calendar" | "list";

const modes: ReadonlyArray<{ value: BrowseMode; label: string }> = [
  { value: "both", label: "Oba pohľady" },
  { value: "calendar", label: "Kalendár" },
  { value: "list", label: "Zoznam" },
];

// Both sections are rendered by the server and remain visible by default.
// The toggle only changes presentation after a deliberate user interaction.
export function EventBrowseMode({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<BrowseMode>("both");

  return (
    <div className={styles.browseMode} data-events-browse-mode={mode}>
      <div className={styles.browseNavigation} role="group" aria-label="Spôsob prezerania podujatí">
        {modes.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={mode === option.value}
            onClick={() => setMode(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}
