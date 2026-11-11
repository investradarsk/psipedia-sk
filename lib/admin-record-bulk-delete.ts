/** Shared, runtime-independent safety rules for deliberate bulk lifecycle removal.
 * No HTTP, D1 or Notion writes belong here; the existing single-record API owns them.
 */
export const ADMIN_BULK_DELETE_LIMIT = 25;
export const ACKNOWLEDGED_REMOVAL_STATES = [
  "COMPLETE", "PENDING_NOTION", "ERROR_NOTION", "READY_LOCAL",
] as const;

export type AdminBulkDeletionPreview = {
  id: number;
  name: string;
  slug: string;
  category: string;
  notionLinked: boolean;
  notionPages: number;
  removalState: string | null;
};

export function validatedAdminBulkIds(ids: readonly number[]) {
  if (!ids.length || ids.length > ADMIN_BULK_DELETE_LIMIT ||
      ids.some(id => !Number.isSafeInteger(id) || id <= 0)) {
    throw Error("INVALID_BULK_ID_SELECTION");
  }
  const unique = [...new Set(ids)];
  if (unique.length !== ids.length) throw Error("DUPLICATE_BULK_ID_SELECTION");
  return unique;
}

export function validatedAdminBulkPreview(id: number, value: unknown): AdminBulkDeletionPreview {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw Error("INVALID_BULK_PREVIEW");
  }
  const item = value as Record<string, unknown>;
  if (item.id !== id || typeof item.name !== "string" || !item.name.trim() ||
      typeof item.slug !== "string" || typeof item.category !== "string" ||
      typeof item.notionLinked !== "boolean" ||
      !Number.isSafeInteger(item.notionPages) || Number(item.notionPages) < 0) {
    throw Error("INVALID_BULK_PREVIEW");
  }
  return item as AdminBulkDeletionPreview;
}

export async function runSequentialAdminRemovals(
  items: readonly AdminBulkDeletionPreview[],
  remove: (item: AdminBulkDeletionPreview) => Promise<string>,
  onProgress?: (done: number, pending: number) => void,
) {
  const acknowledgedIds: number[] = [];
  let pending = 0;
  let failedId: number | null = null;
  let error = "";
  for (const item of items) {
    try {
      const state = await remove(item);
      if (!(ACKNOWLEDGED_REMOVAL_STATES as readonly string[]).includes(state)) {
        throw Error("RECORD_DELETE_NOT_ACKNOWLEDGED");
      }
      acknowledgedIds.push(item.id);
      if (state !== "COMPLETE") pending++;
      onProgress?.(acknowledgedIds.length, pending);
    } catch (caught) {
      failedId = item.id;
      error = caught instanceof Error ? caught.message : "Odstránenie zlyhalo.";
      break;
    }
  }
  return { acknowledgedIds, pending, failedId, error };
}
