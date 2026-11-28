"use client";

import { useSyncExternalStore } from "react";
import { AdminActionButton } from "@/components/admin-interaction-system";

const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

/** Presentational pager only. The owner retains active section, focus and all
 * form state, including dirty guards and save/publish handling. */
export function AdminEditorSectionPager({
  sections, index, onNavigate, ariaLabel, ready = true,
}: {
  sections: readonly { id: string }[];
  index: number;
  onNavigate: (id: string) => void;
  ariaLabel: string;
  ready?: boolean;
}) {
  const hydrated = useSyncExternalStore(subscribe, clientReady, serverReady);
  if (!sections.length) return null;
  const current = Math.min(sections.length - 1, Math.max(0, index));
  const enabled = hydrated && ready;
  return <nav data-admin-editor-pager aria-label={ariaLabel}>
    <AdminActionButton type="button" variant="secondary" disabled={!enabled || current === 0}
      onClick={() => { if (enabled && current > 0) onNavigate(sections[current - 1].id); }}>Predchádzajúca</AdminActionButton>
    <span role="status" aria-live="polite" aria-atomic="true">Sekcia {current + 1} z {sections.length}</span>
    <AdminActionButton type="button" variant="secondary" disabled={!enabled || current >= sections.length - 1}
      onClick={() => { if (enabled && current < sections.length - 1) onNavigate(sections[current + 1].id); }}>Ďalšia</AdminActionButton>
  </nav>;
}
