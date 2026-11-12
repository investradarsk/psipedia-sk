import type { ManagedDirectoryProfile } from "@/lib/directory";
import type { ManagedDirectoryProfileInput } from "@/lib/directory-store";
import { readDirectoryPublicContacts } from "@/lib/directory-profile-metadata";
import { breederReadPath, type BreederEditorialField } from "@/lib/notion-breeder-field-events";

/**
 * Canonical Directory PUT save receipt, shared by all ten categories.
 * Compare the server-sanitized submitted value with the actual D1 projection,
 * never with an optimistic form snapshot. No Notion metadata participates.
 */
export function directoryEditedFieldMismatches(input: {
  submitted: ManagedDirectoryProfileInput;
  persisted: ManagedDirectoryProfile;
  editedPaths: readonly BreederEditorialField[];
}): BreederEditorialField[] {
  const contacts = readDirectoryPublicContacts(input.persisted.importData, input.persisted.websiteUrl ?? "");
  const actual: Record<string, unknown> = {
    ...input.persisted,
    websiteUrl: input.persisted.websiteUrl ?? "",
    publicPhone: contacts.phone,
    publicEmail: contacts.email,
    facebookUrl: contacts.facebook,
    instagramUrl: contacts.instagram,
  };
  const expected = input.submitted as Record<string, unknown>;
  const equal = (left: unknown, right: unknown) => {
    const norm = (value: unknown) =>
      typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim()
      : Array.isArray(value) ? value.map(x => String(x).trim()).filter(Boolean)
      : value ?? "";
    return JSON.stringify(norm(left)) === JSON.stringify(norm(right));
  };
  return [...new Set(input.editedPaths)].filter(path => {
    // Services V3 choices are saved via their dedicated CAS endpoint, never
    // as editorial free-text in the ordinary profile PUT.
    if (path === "services") return false;
    const requested = breederReadPath(expected, path);
    if (requested === undefined) return false;
    const persisted = breederReadPath(actual, path);
    return !equal(requested, persisted);
  });
}
