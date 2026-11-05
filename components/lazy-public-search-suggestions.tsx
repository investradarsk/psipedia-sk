"use client";

import { lazy, Suspense, type ComponentProps } from "react";
import type { PublicSearchSuggestions } from "./public-search-suggestions";

type SuggestionProps = ComponentProps<typeof PublicSearchSuggestions>;

// This module is excluded from the first-load header/homepage bundle.
// It is fetched when an active search first reaches two characters.
const DeferredSuggestions = lazy(async () => {
  const suggestionsModule = await import("./public-search-suggestions");
  return { default: suggestionsModule.PublicSearchSuggestions };
});

export function LazyPublicSearchSuggestions(props: SuggestionProps) {
  // No effect-driven state update: React mounts the autocomplete only while
  // it is relevant. The child's unmount cleanup removes ARIA references.
  if (props.enabled === false || props.query.trim().length < 2) return null;
  return (
    <Suspense fallback={null}>
      <DeferredSuggestions {...props} />
    </Suspense>
  );
}
