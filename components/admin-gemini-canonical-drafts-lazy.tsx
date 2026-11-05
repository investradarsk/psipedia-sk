"use client";

import dynamic from "next/dynamic";

// Do not send the concept manager bundle to every Gemini settings visitor.
// Only load it after an explicit request or a deep link to a draft.
const LazyCanonicalDrafts = dynamic(
  () => import("./admin-gemini-canonical-drafts").then((module) => module.AdminGeminiCanonicalDrafts),
  {
    ssr: false,
    loading: () => <p role="status">Načítavam zoznam konceptov…</p>,
  },
);

export function AdminGeminiNotionDrafts({ stableKey, deepLinkDraftId }: {
  stableKey: string;
  deepLinkDraftId?: string;
  nativeOnly?: boolean;
}) {
  return <LazyCanonicalDrafts stableKey={stableKey}
    deepLinkDraftId={deepLinkDraftId} initiallyExpanded />;
}
