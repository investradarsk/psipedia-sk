import type { ReactNode } from "react";

export type VisualExampleCategory = "hero" | "cta" | "karty";

export type VisualExampleUse = {
  url: string;
  label: string;
  placement: string;
  anchorId?: string;
  note?: string;
};

export type VisualLibraryExample = {
  id: string;
  category: VisualExampleCategory;
  label: string;
  explanation: string;
  uses: readonly VisualExampleUse[];
  preview: ReactNode;
};
