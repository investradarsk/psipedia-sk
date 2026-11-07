"use client";

import { createContext } from "react";

/** Opt-in visibility for canonical editor sections.
 * Keep every section mounted: switching must not reset Lexical, photos,
 * selected relations or other in-progress controlled form state.
 */
export const AdminEditorSectionVisibility = createContext<{
  activeId: string;
  mode: "scroll" | "switch";
} | null>(null);
