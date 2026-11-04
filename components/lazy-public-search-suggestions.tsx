"use client";

import { lazy, Suspense, useEffect, useState, type ComponentProps } from "react";
import type { PublicSearchSuggestions } from "./public-search-suggestions";

type SuggestionProps = ComponentProps<typeof PublicSearchSuggestions>;

// The autocomplete code is not part of the shared header/homepage initial
// bundle. Import only after an actual search starts, never on a blank input.
const DeferredSuggestions = lazy(async () => {
  const module = await import("./public-search-suggestions");
  return { default: module.PublicSearchSuggestions };
});

export function LazyPublicSearchSuggestions(props: SuggestionProps) {
  const [activated, setActivated] = useState(false);
  useEffect(() => {
    if (props.enabled !== false && props.query.trim().length >= 2) {
      setActivated(true);
    }
  }, [props.enabled, props.query]);

  // Once activated keep the suggestions component mounted so its keyboard and
  // ARIA cleanup continue working when the user erases the search query.
  if (!activated) return null;
  return (
    <Suspense fallback={null}>
      <DeferredSuggestions {...props} />
    </Suspense>
  );
}
