"use client";

import { Suspense, use } from "react";
import { AdminAutomationUpdateSuggestions } from "@/components/admin-automation-update-suggestions";
import type { CanonicalUpdateSuggestion } from "@/lib/data-automation-update-review";

export type OrganizationSuggestionsResult = {
  suggestions: CanonicalUpdateSuggestion[];
  failed: boolean;
};

function SuggestionsContent({
  promise,
  onAccepted,
}: {
  promise: Promise<OrganizationSuggestionsResult>;
  onAccepted: (values: Record<string, unknown>) => void;
}) {
  const { suggestions, failed } = use(promise);
  if (failed) {
    return <p role="status" className="admin-message">
      Návrhy automatizácie sa nepodarilo načítať. Údaje organizácie môžeš bezpečne upravovať a uložiť.
    </p>;
  }
  return <AdminAutomationUpdateSuggestions initialSuggestions={suggestions} onAccepted={onAccepted} />;
}

/** Suspends only this optional suggestion panel, never the editable form. */
export function AdminOrganizationSuggestions(props: {
  promise: Promise<OrganizationSuggestionsResult>;
  onAccepted: (values: Record<string, unknown>) => void;
}) {
  return <Suspense fallback={<p role="status">Načítavam doplnkové návrhy…</p>}>
    <SuggestionsContent {...props} />
  </Suspense>;
}
