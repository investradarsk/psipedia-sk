import { validateNotionBreedCandidate, type ManagedBreed, type ManagedBreedInput } from "./breed-store";
import { type BreedNotionField, type BreedFieldSnapshot, type planBreedNotionFieldDelta } from "./notion-breed-field-delta";

type BreedFieldPlan = ReturnType<typeof planBreedNotionFieldDelta>;
export type BreedSyncSkipped = { field: BreedNotionField; error: string };

function valueForField(patch: ManagedBreedInput, field: BreedNotionField): unknown {
  if (field === "seo.title") return patch.seo?.title;
  if (field === "seo.description") return patch.seo?.description;
  return (patch as Record<string, unknown>)[field];
}

function applyOneField(current: ManagedBreedInput, patch: ManagedBreedInput, field: BreedNotionField): ManagedBreedInput {
  const value = valueForField(patch, field);
  if (value === undefined) return current; // Absent optional source data is not a clear.
  if (field === "seo.title" || field === "seo.description") {
    return { ...current, seo: { ...current.seo, [field.slice(4)]: value } };
  }
  if (field === "fciStandard" || field === "editorial") {
    const before = current[field] ?? {};
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return { ...current, [field]: { ...before, ...value } };
    }
    return current;
  }
  return { ...current, [field]: value };
}

/**
 * Validate every independent field against the stored breed before any D1
 * update. One bad measurement, structured field or sport list does not cancel
 * correctly edited text fields. Identity, publishing, images and relations are
 * never included. No partial D1 writes are made during this planning phase.
 */
export function planSafeBreedFields(
  existing: ManagedBreed,
  plan: BreedFieldPlan,
  invalidSourceFields: ReadonlySet<BreedNotionField> = new Set(),
) {
  let candidate: ManagedBreedInput = { ...existing };
  const accepted: BreedNotionField[] = [];
  const skipped: BreedSyncSkipped[] = plan.conflicts.map(field=>({
    field, error: "Súčasná zmena rovnakého poľa v Admin aj Notion – vyžaduje kontrolu",
  }));
  for (const field of plan.accepted) {
    if (invalidSourceFields.has(field)) {
      skipped.push({ field, error: "Neplatná štruktúra údaja z Notionu" });
      continue;
    }
    const next = applyOneField(candidate, plan.patch, field);
    try {
      validateNotionBreedCandidate(next, existing);
      candidate = next;
      accepted.push(field);
    } catch (error) {
      skipped.push({ field, error: error instanceof Error ? error.message : String(error) });
    }
  }
  // A field may have failed parsing before field-level delta planning.
  for (const field of invalidSourceFields) {
    if (!skipped.some(item => item.field === field))
      skipped.push({ field, error: "Neplatná štruktúra údaja z Notionu" });
  }
  return { candidate, accepted, skipped };
}

export function partialBreedNotionReceipt(
  previous: BreedFieldSnapshot,
  latest: BreedFieldSnapshot,
  accepted: readonly BreedNotionField[],
  ignoredByAdmin: readonly BreedNotionField[] = [],
): BreedFieldSnapshot {
  const next = { ...previous };
  for (const key of [...accepted, ...ignoredByAdmin]) next[key] = latest[key];
  // Skipped fields keep the old Notion snapshot, so a later cron or webhook
  // can safely retry without falsely acknowledging rejected input.
  return next;
}

export function breedPartialError(skipped: readonly BreedSyncSkipped[]) {
  return "Čiastočná synchronizácia – nevyriešené: " +
    skipped.slice(0, 6).map(item => `${item.field}: ${item.error}`).join("; ") +
    (skipped.length > 6 ? `; a ďalších ${skipped.length - 6} polí` : "");
}
