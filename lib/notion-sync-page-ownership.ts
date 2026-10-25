/**
 * Shared read-only Notion page ownership check for all Psipedia agendas.
 *
 * A page from a different data source, a moved page or an archived/trash page
 * is never a safe source of canonical edits or a target for a Notion PATCH.
 * Missing ownership metadata fails closed: never infer identity from title.
 */
export type NotionOwnedPage = {
  id: string;
  parent?: { type?: string; data_source_id?: string };
  archived?: boolean;
  in_trash?: boolean;
};

export function notionPageBelongsToDataSource(
  page: NotionOwnedPage,
  expectedDataSourceId: string,
): boolean {
  const normalize = (id: string) => id.replaceAll("-", "").toLowerCase();
  const expected = normalize(expectedDataSourceId);
  const actual = typeof page.parent?.data_source_id === "string"
    ? normalize(page.parent.data_source_id) : "";
  return !page.archived
    && !page.in_trash
    && page.parent?.type === "data_source_id"
    && /^[0-9a-f]{32}$/.test(expected)
    && actual === expected;
}
