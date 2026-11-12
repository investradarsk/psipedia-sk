"use client";

import { lazy, Suspense, useEffect, useState } from "react";

// The back-to-top button has no visible UI until the visitor scrolls.
// Do not hydrate its component, icons or CSS on initial page load.
const DeferredBackToTop = lazy(async () => {
  const backToTop = await import("./back-to-top");
  return { default: backToTop.BackToTop };
});

export function LazyBackToTop() {
  const [activated, setActivated] = useState(false);

  useEffect(() => {
    const reveal = () => {
      if (window.scrollY <= 480) return;
      window.removeEventListener("scroll", reveal);
      setActivated(true);
    };
    // Do not set React state synchronously from the effect body.
    const frame = window.requestAnimationFrame(reveal);
    window.addEventListener("scroll", reveal, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", reveal);
    };
  }, []);

  return activated ? (
    <Suspense fallback={null}>
      <DeferredBackToTop />
    </Suspense>
  ) : null;
}
