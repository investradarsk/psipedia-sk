"use client";

import { useState, type ReactNode } from "react";

/**
 * Mount expensive editor fields only when their native <details> is opened.
 * Keep them mounted after the first opening so unsaved input is never lost
 * when the editor collapses the section again.
 */
export function AdminDeferredDetails({
  summary,
  className,
  children,
}: {
  summary: string;
  className?: string;
  children: ReactNode;
}) {
  const [everOpened, setEverOpened] = useState(false);

  return (
    <details
      className={className}
      onToggle={(event) => {
        if (event.currentTarget.open) setEverOpened(true);
      }}
    >
      <summary>{summary}</summary>
      {everOpened ? children : null}
    </details>
  );
}
