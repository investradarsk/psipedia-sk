import {
  BREEDER_NOTION_EDITORIAL_FIELDS,
  breederReadPath,
  type BreederEditorialField,
} from "./notion-breeder-field-events.ts";

/**
 * Compare every requested editable property from the canonical saved D1
 * snapshot against a FRESH Notion GET. Missing properties do not confirm
 * intentional blanks; unchanged and blank values are checked as strictly
 * as changed values. Only HTTP(S) URL canonicalization is tolerated.
 */
export function directoryNotionFullMirrorMismatches(input: {
  expected: Record<string, unknown>;
  actual: Record<string, unknown>;
  presentNotionProperties: readonly string[];
  paths: readonly BreederEditorialField[];
}): BreederEditorialField[] {
  const present = new Set(input.presentNotionProperties);
  const equivalent = (a: string, b: string) => {
    if (a === b) return true;
    try {
      const left = new URL(a), right = new URL(b);
      return ["http:", "https:"].includes(left.protocol) && left.href === right.href;
    } catch { return false; }
  };
  const asText = (raw: unknown) =>
    Array.isArray(raw) ? raw.join("\n") : typeof raw === "string" ? raw.trim() : "";
  return input.paths.filter(path => {
    const name = BREEDER_NOTION_EDITORIAL_FIELDS[path];
    if (!present.has(name)) return true;
    const expectedValue = breederReadPath(input.expected, path);
    const actualValue = breederReadPath(input.actual, path);
    if (path === "seo.noindex")
      return typeof expectedValue !== "boolean" ||
        typeof actualValue !== "boolean" || actualValue !== expectedValue;
    return !equivalent(asText(expectedValue), asText(actualValue));
  });
}
