"use client";

import { useId, useState, type ReactNode } from "react";

export function BreedFciDisclosure({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const contentId = useId();

  return (
    <div className={`breed-fci-disclosure${open ? " is-open" : ""}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{open ? "Skryť celý FCI štandard" : "Zobraziť celý FCI štandard"}</span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      <div id={contentId} hidden={!open}>{children}</div>
    </div>
  );
}
