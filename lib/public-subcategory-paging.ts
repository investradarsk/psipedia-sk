/** Shared six-at-a-time category navigation contract, desktop remains unpaged. */
export const PUBLIC_SUBCATEGORY_PAGE_SIZE = 6;

export function publicSubcategoryPageGroups<T>(items: readonly T[]): T[][] {
  const pages: T[][] = [];
  for (let offset = 0; offset < items.length; offset += PUBLIC_SUBCATEGORY_PAGE_SIZE) {
    pages.push(items.slice(offset, offset + PUBLIC_SUBCATEGORY_PAGE_SIZE));
  }
  return pages;
}
