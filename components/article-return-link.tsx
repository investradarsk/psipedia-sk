"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { readInternalTrail, writeInternalTrail } from "@/lib/internal-route-trail";

/**
 * A reliable same-site return action when iOS Chrome consumes its own edge
 * navigation gesture before our document-level swipe handler receives touchend.
 * Only internal, session-scoped routes can be used as destinations.
 */
export function ArticleReturnLink({
  fallbackHref,
  className,
}: {
  fallbackHref: string;
  className?: string;
}) {
  const pathname = usePathname();
  const [destination, setDestination] = useState(fallbackHref);

  useEffect(() => {
    // Defer state changes until after the effect; keep React hooks lint clean.
    const frame = window.requestAnimationFrame(() => {
      const current = window.location.pathname + window.location.search;
      const trail = readInternalTrail(window.sessionStorage);
      const index = trail.lastIndexOf(current);
      // The article may mount before the header records this new URL.
      const previous = index > 0 ? trail[index - 1] : index === -1 ? trail.at(-1) : null;
      setDestination(previous && previous !== current ? previous : fallbackHref);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname, fallbackHref]);

  return (
    <Link
      href={destination}
      className={className}
      data-article-safe-back
      aria-label="Späť na predchádzajúcu stránku na Psipedii"
      onClick={() => {
        const current = window.location.pathname + window.location.search;
        const trail = readInternalTrail(window.sessionStorage);
        const index = trail.lastIndexOf(current);
        if (index > 0 && trail[index - 1] === destination) {
          writeInternalTrail(window.sessionStorage, trail.slice(0, index));
        }
      }}
    >
      <span aria-hidden="true">←</span>
      <span>Späť</span>
    </Link>
  );
}
