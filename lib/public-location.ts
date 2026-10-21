/** Public presentation guard for historical location placeholders.
 * A synthetic "Online" or "Slovensko" value is not a real Slovak locality.
 * Do not change the stored source or infer a city from an unrelated address.
 */
export type PublicLocationField = "city" | "district" | "region" | "other";

export function publicLocationValue(
  value: string | null | undefined,
  field: PublicLocationField = "other",
): string {
  const text = value?.trim() ?? "";
  if (/^(?:online|online podujatie)$/iu.test(text)) return "";
  if (field !== "other" && /^(?:slovensko|slovenská republika)$/iu.test(text)) return "";
  return text;
}

export function publicLocationLabel(
  values: Array<string | null | undefined>,
  separator = " · ",
): string {
  return [...new Set(values.map((value) => publicLocationValue(value)).filter(Boolean))].join(separator);
}
