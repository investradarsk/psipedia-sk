/** Display-only comparison: preserve the distinct editorial fields in D1 and Admin. */
function normalizeDirectoryDescription(value: string | null | undefined): string {
  return (value ?? "").normalize("NFC").replace(/\s+/gu, " ").trim().toLocaleLowerCase("sk");
}

export function isDuplicatedDirectoryDescription(
  excerpt: string | null | undefined,
  description: string | null | undefined,
): boolean {
  const short = normalizeDirectoryDescription(excerpt);
  return short.length > 0 && short === normalizeDirectoryDescription(description);
}
