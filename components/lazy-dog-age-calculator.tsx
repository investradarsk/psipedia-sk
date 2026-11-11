"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";

// This interactive calculator lives at the end of the homepage. Keep its
// controls and state logic out of the hero/header's initial JS evaluation.
const InteractiveCalculator = lazy(async () => {
  const module = await import("./dog-age-calculator");
  return { default: module.DogAgeCalculator };
});

function CalculatorPlaceholder() {
  return (
    <div className="age-calculator" style={{ minHeight: 340 }} role="status">
      <p>Kalkulačka veku psa sa pripravuje…</p>
    </div>
  );
}

export function LazyDogAgeCalculator() {
  const container = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      setEnabled(true);
      return;
    }
    // Begin fetching before the visitor reaches the bottom-of-page widget.
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setEnabled(true);
      observer.disconnect();
    }, { rootMargin: "600px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={container} style={{ display: "grid", minWidth: 0 }} data-home-calculator-island>
      {enabled ? (
        <Suspense fallback={<CalculatorPlaceholder />}>
          <InteractiveCalculator />
        </Suspense>
      ) : (
        <CalculatorPlaceholder />
      )}
    </div>
  );
}
