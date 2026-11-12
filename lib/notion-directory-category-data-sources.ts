/**
 * Prepared Notion data-source registry for splitting the shared Adresár into
 * one database per active directory category.
 *
 * STAGE 1 ONLY: never use these sources for live reads/writes until the
 * sync adapters, webhook routing, automations and mapping migration are ready.
 * The legacy source remains authoritative during preparation.
 */
import type { ServiceFilterCategory } from "./directory-filter-contract";

export const LEGACY_NOTION_DIRECTORY_DATA_SOURCE_ID =
  "84e0664c-ca47-405f-9d54-31b20287bc8c" as const;

export const NOTION_DIRECTORY_CATEGORY_DATA_SOURCE_IDS = {
  veterinari: "ab4ac5be-716c-48dd-8376-901cd032c7c4",
  treneri: "db6f16c6-282a-4840-a2dd-4c682d5330f2",
  "kynologicke-kluby": "3dbce736-813e-4c6c-a923-90206c522a2e",
  "chovatelske-kluby": "1c3f5b38-313d-4733-8cc8-df38fdf72beb",
  "chovatelske-stanice": "dc1ecac5-ebde-4329-9807-17af7c29c391",
  "salony-a-sluzby": "a4e4d460-b72d-4d0e-b11a-99881c05d076",
  "hotely-a-opatrovanie": "a1e6d54a-8381-4411-8144-af89e45975e6",
  vencenie: "f16a1537-eef8-4560-bd17-231c3cdbd065",
  fyzioterapia: "defd155b-19c0-409f-a2f7-575260fa0b4c",
  "dalsie-sluzby": "62fbe55d-0ae0-48c5-8e4e-cba9c8de2061",
} as const satisfies Record<ServiceFilterCategory, string>;

export type PreparedDirectoryNotionCategory =
  keyof typeof NOTION_DIRECTORY_CATEGORY_DATA_SOURCE_IDS;

export function preparedNotionDirectorySourceForCategory(
  category: string,
): string | null {
  return Object.prototype.hasOwnProperty.call(
    NOTION_DIRECTORY_CATEGORY_DATA_SOURCE_IDS,
    category,
  )
    ? NOTION_DIRECTORY_CATEGORY_DATA_SOURCE_IDS[
        category as PreparedDirectoryNotionCategory
      ]
    : null;
}

export function categoryForPreparedNotionDirectorySource(
  sourceId: string | null | undefined,
): PreparedDirectoryNotionCategory | null {
  const normalized = String(sourceId ?? "")
    .replace(/^collection:\/\//, "")
    .replaceAll("-", "")
    .toLowerCase();
  const match = (
    Object.entries(NOTION_DIRECTORY_CATEGORY_DATA_SOURCE_IDS) as Array<
      [PreparedDirectoryNotionCategory, string]
    >
  ).find(([, id]) => id.replaceAll("-", "") === normalized);
  return match?.[0] ?? null;
}
