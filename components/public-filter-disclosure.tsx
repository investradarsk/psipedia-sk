"use client";

import { useId, useState, type ReactNode } from "react";

function activeFilterLabel(count: number) {
  return count === 1 ? "1 aktívny" : count > 1 && count < 5 ? `${count} aktívne` : `${count} aktívnych`;
}

export function PublicFilterDisclosure({
  children,
  activeCount = 0,
  label = "Ďalšie filtre",
  buttonClassName,
  contentClassName,
  openContentClassName,
}: {
  children: ReactNode;
  activeCount?: number;
  label?: string;
  buttonClassName?: string;
  contentClassName?: string;
  openContentClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const contentId = useId();

  return (
    <>
      <button
        className={buttonClassName}
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{label}</span>
        {activeCount > 0 ? <span data-public-filter-count>{activeFilterLabel(activeCount)}</span> : null}
        <span data-public-filter-hint aria-hidden="true">{open ? "Skryť" : "Zobraziť"}</span>
      </button>
      <div
        id={contentId}
        className={[contentClassName, open ? openContentClassName : ""].filter(Boolean).join(" ")}
      >
        {children}
      </div>
    </>
  );
}
