import { parseBreedFieldSnapshot } from "./notion-breed-field-delta";

/**
 * A legacy hash, malformed JSON, or a partial snapshot is NOT a cutover
 * baseline. Count only receipts the actual 60-field runtime can decode.
 */
export function isCompatibleBreedWorkcopyReceipt(value: string | null | undefined): boolean {
  if (!value?.startsWith("breed-field-v1:")) return false;
  try {
    const entry = JSON.parse(value.slice("breed-field-v1:".length)) as {
      notion?: string; admin?: string;
    };
    return Boolean(parseBreedFieldSnapshot(entry.notion ?? null) &&
      parseBreedFieldSnapshot(entry.admin ?? null));
  } catch {
    return false;
  }
}
