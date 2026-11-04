"use client";

import { useId, useState, useSyncExternalStore, type ReactNode } from "react";

// SSR and hydration share the disabled snapshot. React enables the control only
// after the client has hydrated and attached its click handler.
const subscribeHydration = () => () => {};
const clientHydrationSnapshot = () => true;
const serverHydrationSnapshot = () => false;

function activeFilterLabel(count: number) {
  return count === 1
    ? "1 aktívny"
    : count > 1 && count < 5
      ? `${count} aktívne`
      : `${count} aktívnych`;
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
  const ready = useSyncExternalStore(
    subscribeHydration,
    clientHydrationSnapshot,
    serverHydrationSnapshot,
  );
  const contentId = useId();


  return (
    <>
      <button
        data-public-filter-toggle
        className={buttonClassName}
        type="button"
        disabled={!ready}
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{label}</span>
        {activeCount > 0 ? (
          <span data-public-filter-count>{activeFilterLabel(activeCount)}</span>
        ) : null}
        <span data-public-filter-hint aria-hidden="true">
          {open ? "Skryť" : "Zobraziť"}
        </span>
      </button>
      <div
        id={contentId}
        data-public-filter-disclosure
        className={[contentClassName, open ? openContentClassName : ""].filter(Boolean).join(" ")}
      >
        {children}
      </div>
    </>
  );
}
