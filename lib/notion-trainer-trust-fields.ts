/**
 * Trainer trust signals are explicit per-field actions, separate from editorial
 * text, publication status and canonical Services V3. Never infer edits from
 * a whole profile payload or an unrelated Notion webhook.
 */
export const TRAINER_TRUST_NOTION_PROPERTIES = {
  verified: "Overené",
  featured: "Odporúčané",
} as const;

export type TrainerTrustField = keyof typeof TRAINER_TRUST_NOTION_PROPERTIES;
export const TRAINER_TRUST_FIELDS = Object.keys(TRAINER_TRUST_NOTION_PROPERTIES) as TrainerTrustField[];

export function changedTrainerTrustNotionFields(
  properties: Record<string, unknown> | undefined,
  changedIds: readonly string[],
): TrainerTrustField[] {
  const changed = new Set(changedIds);
  return TRAINER_TRUST_FIELDS.filter(field => {
    const key = TRAINER_TRUST_NOTION_PROPERTIES[field];
    const item = properties?.[key];
    const id = item && typeof item === "object" && !Array.isArray(item)
      ? (item as { id?: unknown }).id : undefined;
    return changed.has(key) || (typeof id === "string" && changed.has(id));
  });
}

export function changedTrainerTrustAdminFields(
  before: Readonly<Record<TrainerTrustField, boolean>>,
  after: Readonly<Record<TrainerTrustField, boolean>>,
): TrainerTrustField[] {
  return TRAINER_TRUST_FIELDS.filter(field => before[field] !== after[field]);
}

export function preserveUneditedTrainerTrust(
  live: Readonly<Record<TrainerTrustField, boolean>>,
  submitted: Readonly<Partial<Record<TrainerTrustField, unknown>>>,
  edited: readonly TrainerTrustField[],
): Record<TrainerTrustField, boolean> {
  const next = { ...live };
  for (const field of edited) {
    if (typeof submitted[field] !== "boolean")
      throw new Error("TRAINER_TRUST_VALUE_INVALID: " + field);
    next[field] = submitted[field] as boolean;
  }
  return next;
}
