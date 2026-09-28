import {
  getDirectoryCategory,
  type DirectoryCategorySlug,
  type DirectoryProfileEditableData,
  type PublicDirectoryProfile,
} from "@/lib/directory";

export const specializedChangeRequestFields: Partial<Record<DirectoryCategorySlug, string[]>> = {
  vencenie: [
    "Individuálne venčenie", "Skupinové venčenie", "Venčenie s tréningom", "Šteňatá",
    "Veľké psy", "Seniori / špeciálne potreby", "Vyzdvihnutie psa", "GPS / foto report",
  ],
  fyzioterapia: [
    "Hydroterapia", "Laserterapia", "Magnetoterapia", "Elektroterapia", "Manuálne techniky",
    "Dogfitness / prevencia", "Pooperačná rehabilitácia", "Ortopedickí pacienti",
    "Neurologickí pacienti", "Športové / pracovné psy", "Odborník / certifikácia",
  ],
  "chovatelske-stanice": [
    "Plemeno", "Plemená", "FCI skupina", "Chovateľ", "Klub", "Aktívny chov", "Aktuálne vrhy",
  ],
  "dalsie-sluzby": [
    "Typ služby", "Pokrytie", "Celoslovenská dostupnosť", "Výjazd ku klientovi", "Hlavné služby",
  ],
};

function importedValue(profile: PublicDirectoryProfile, ...keys: string[]) {
  for (const key of keys) {
    const value = profile.importData?.[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
  }
  return "";
}

function publicUrl(value: string | null | undefined) {
  const clean = value?.trim() ?? "";
  if (!clean) return "";
  const candidate = /^https?:\/\//i.test(clean) ? clean : /^[\w.-]+\.[a-z]{2,}(?:\/|$)/i.test(clean) ? `https://${clean}` : "";
  if (!candidate) return "";
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function firstEmail(value: string) {
  return value.split(/[;,]/).map((item) => item.trim()).find((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)) ?? "";
}

export function editableDirectoryProfileData(profile: PublicDirectoryProfile): DirectoryProfileEditableData {
  const specialized = Object.fromEntries((specializedChangeRequestFields[profile.category] ?? []).map((label) => [label, importedValue(profile, label)]));
  return {
    name: profile.name,
    serviceType: importedValue(profile, "Typ služby", "Typ poskytovateľa", "Typ klubu") || getDirectoryCategory(profile.category)?.singular || "",
    city: profile.city,
    district: profile.district,
    region: profile.region,
    address: profile.address,
    phone: importedValue(profile, "Telefón", "Telefon", "phone"),
    email: firstEmail(importedValue(profile, "E-mail", "Email", "email")),
    website: publicUrl(importedValue(profile, "Web", "Webstránka") || profile.websiteUrl),
    facebook: publicUrl(importedValue(profile, "Facebook")),
    instagram: publicUrl(importedValue(profile, "Instagram")),
    description: profile.description || profile.excerpt,
    services: profile.services,
    priceNote: profile.priceNote,
    coverage: importedValue(profile, "Pokrytie", "Oblasť pôsobenia", "Lokalita / pokrytie"),
    online: profile.online,
    specialized,
  };
}
