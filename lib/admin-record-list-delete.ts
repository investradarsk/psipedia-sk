import type { RecordKind } from "./admin-record-lifecycle";

/** Owner-confirmed list deletion uses the same guarded lifecycle as the editor.
 * The GET/POST pair never guesses a Notion page or bypasses the durable D1
 * tombstone. A pending result is NOT a completed hard delete.
 */
export type AdminListRemovalResult = {
  state: "COMPLETE" | "PENDING_NOTION" | "ERROR_NOTION" | "READY_LOCAL";
  errorCode?: string | null;
};

type RemovalPreview = {
  id: number;
  name: string;
  slug: string;
  category: string;
  notionLinked: boolean;
};

export async function removeAdminRecordFromList(
  kind: RecordKind,
  recordId: number,
  confirmedName: string,
  request: typeof fetch = fetch,
): Promise<AdminListRemovalResult> {
  if (!Number.isSafeInteger(recordId) || recordId < 1 || !confirmedName.trim()) {
    throw new Error("Neplatný záznam na odstránenie.");
  }
  const url = `/api/admin/record-lifecycle/${encodeURIComponent(kind)}/${recordId}`;
  const preflight = await request(url, {
    credentials: "same-origin",
    cache: "no-store",
  });
  const preview = await preflight.json() as Partial<RemovalPreview> & { error?: string };
  if (!preflight.ok) throw new Error(preview.error || "Kontrola pred odstránením zlyhala.");
  if (
    preview.id !== recordId ||
    preview.name !== confirmedName ||
    typeof preview.slug !== "string" ||
    typeof preview.category !== "string" ||
    typeof preview.notionLinked !== "boolean"
  ) {
    throw new Error("Záznam sa medzitým zmenil. Obnov zoznam a potvrď odstránenie znova.");
  }

  const response = await request(url, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "delete",
      confirmed: true,
      localOnly: !preview.notionLinked,
      expectedSlug: preview.slug,
      expectedName: preview.name,
      expectedCategory: preview.category,
    }),
  });
  const result = await response.json() as Partial<AdminListRemovalResult> & { error?: string };
  if (!response.ok) throw new Error(result.error || "Odstránenie záznamu zlyhalo.");
  if (
    result.state !== "COMPLETE" &&
    result.state !== "PENDING_NOTION" &&
    result.state !== "ERROR_NOTION" &&
    result.state !== "READY_LOCAL"
  ) {
    throw new Error("Odstránenie nebolo potvrdené. Skontroluj stav záznamu.");
  }
  return { state: result.state, errorCode: result.errorCode };
}

/** A hidden tombstone is not equivalent to a completed D1/Notion removal. */
export function adminListRemovalMessage(result: AdminListRemovalResult, noun: string): string {
  return result.state === "COMPLETE"
    ? `${noun} bol natrvalo odstránený z aktívnej D1 databázy.`
    : `${noun} je skrytý, ale trvalé odstránenie ešte nie je dokončené (${result.errorCode || result.state}).`;
}
