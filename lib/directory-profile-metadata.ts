export type DirectoryImportData = Record<string, string | number | null>;

const contactAliases = {
  phone: ["Telefón", "Telefon", "phone"],
  email: ["E-mail", "Email", "email"],
  website: ["Web", "Webstránka"],
  facebook: ["Facebook"],
  instagram: ["Instagram"],
} as const;

function firstValue(data: DirectoryImportData | null | undefined, keys: readonly string[]) {
  for (const key of keys) {
    const value = data?.[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
  }
  return "";
}

export function readDirectoryPublicContacts(
  data: DirectoryImportData | null | undefined,
  websiteFallback = "",
) {
  return {
    phone: firstValue(data, contactAliases.phone),
    email: firstValue(data, contactAliases.email),
    website: firstValue(data, contactAliases.website) || websiteFallback,
    facebook: firstValue(data, contactAliases.facebook),
    instagram: firstValue(data, contactAliases.instagram),
  };
}

export function mergeDirectoryPublicContactData(
  current: DirectoryImportData | null | undefined,
  input: {
    publicPhone?: string;
    publicEmail?: string;
    websiteUrl?: string | null;
    facebookUrl?: string;
    instagramUrl?: string;
  },
) {
  const next: DirectoryImportData = { ...(current ?? {}) };
  const replace = (keys: readonly string[], canonical: string, value: string | null | undefined) => {
    if (value === undefined) return;
    for (const key of keys) delete next[key];
    if (value) next[canonical] = value;
  };

  replace(contactAliases.phone, "Telefón", input.publicPhone);
  replace(contactAliases.email, "E-mail", input.publicEmail);
  replace(contactAliases.website, "Web", input.websiteUrl);
  replace(contactAliases.facebook, "Facebook", input.facebookUrl);
  replace(contactAliases.instagram, "Instagram", input.instagramUrl);
  return next;
}
