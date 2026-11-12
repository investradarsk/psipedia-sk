"use client";

import { Suspense, use } from "react";
import { AdminAutomationUpdateSuggestions } from "@/components/admin-automation-update-suggestions";
import { AdminOptionalReadError } from "@/components/admin-recovery-actions";
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
  onAccepted: (values: Record<string, unknown>, updatedAt: string) => void;
}) {
  const { suggestions, failed } = use(promise);
  if (failed) {
    return <AdminOptionalReadError message="Návrhy automatizácie sa nepodarilo načítať. Údaje organizácie môžeš bezpečne upravovať a uložiť." />;
  }
  return <AdminAutomationUpdateSuggestions initialSuggestions={suggestions} onAccepted={onAccepted} />;
}

/** Suspends only this optional suggestion panel, never the editable form. */
export function AdminOrganizationSuggestions(props: {
  promise: Promise<OrganizationSuggestionsResult>;
  onAccepted: (values: Record<string, unknown>, updatedAt: string) => void;
}) {
  return <Suspense fallback={<p role="status">Načítavam doplnkové návrhy…</p>}>
    <SuggestionsContent {...props} />
  </Suspense>;
}
