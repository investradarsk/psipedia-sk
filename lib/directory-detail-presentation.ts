import type { DirectoryCategorySlug, PublicDirectoryProfile } from "@/lib/directory";

export type DirectoryDetailFact = { label: string; value: string };
export type DirectoryDetailPhone = { value: string; href: string };
export type DirectoryDetailEmail = { value: string; href: string };
export type DirectoryDetailHealth = {
  variant: "veterinari" | "fyzioterapia";
  eyebrow: string;
  title: string;
  facts: DirectoryDetailFact[];
};

export type DirectoryDetailPresentation = {
  id: number;
  slug: string;
  name: string;
  category: DirectoryCategorySlug;
  excerpt: string;
  services: string[];
  qualifications: string[];
  city: string;
  district: string;
  region: string;
  address: string;
  online: boolean;
  priceNote: string;
  imageUrl: string | null;
  verified: boolean;
  featured: boolean;
  description: string | null;
  descriptionParagraphs: string[];
  coverage: string | null;
  facts: DirectoryDetailFact[];
  health: DirectoryDetailHealth | null;
  phone: DirectoryDetailPhone | null;
  emails: DirectoryDetailEmail[];
  websiteUrl: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  navigationUrl: string | null;
};

const unavailableValue = /^(?:neoveren[eé]|nezisten[eé]|neuveden[eé]|n\/a|nie je uveden[eé])$/i;
const relationFields = ["Plemeno", "Plemená", "FCI skupina", "Organizácia", "Zastrešujúca organizácia"] as const;

const detailFields: Partial<Record<DirectoryCategorySlug, string[]>> = {
  veterinari: ["Špecializácie", "Pohotovosť", "Hospitalizácia", "RTG", "USG", "Laboratórium"],
  treneri: ["Individuálny výcvik", "Skupinový výcvik", "Výcvik šteniat", "Behaviorálne poradenstvo", "Online konzultácie"],
  "kynologicke-kluby": ["Typ klubu", "Zameranie", "Organizácia", "Výcvik šteniat", "Individuálny výcvik", "Skupinový výcvik", "Športová kynológia", "Obrany", "Stopy", "Agility", "Rally obedience", "Retriever / poľovnícka kynológia"],
  "chovatelske-kluby": ["Plemeno", "Plemená", "FCI skupina", "Organizácia", "Zastrešujúca organizácia"],
  "chovatelske-stanice": ["Plemeno", "Plemená", "FCI skupina", "Chovateľ", "Klub", "Aktívny chov", "Aktuálne vrhy", "Plánované vrhy"],
  "hotely-a-opatrovanie": ["Hotel", "Opatrovanie", "Denná starostlivosť", "Vyzdvihnutie psa", "Online objednanie"],
  vencenie: ["Individuálne venčenie", "Skupinové venčenie", "Venčenie s tréningom", "Šteňatá", "Veľké psy", "Seniori / špeciálne potreby", "Vyzdvihnutie psa", "GPS / foto report", "Typ poskytovateľa"],
  fyzioterapia: ["Hydroterapia", "Laserterapia", "Magnetoterapia", "Elektroterapia", "Manuálne techniky", "Dogfitness / prevencia", "Pooperačná rehabilitácia", "Ortopedickí pacienti", "Neurologickí pacienti", "Športové / pracovné psy", "Mobilná služba", "Odborník / certifikácia"],
  "dalsie-sluzby": ["Typ služby", "Pokrytie", "Výjazd ku klientovi", "Celoslovenská dostupnosť", "Orientačná cena"],
};

function importedValue(profile: PublicDirectoryProfile, ...keys: string[]) {
  for (const key of keys) {
    const value = profile.importData?.[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
  }
  return null;
}

export function usefulDirectoryDetailValue(value: string | null | undefined) {
  const clean = value?.trim() || null;
  return clean && !unavailableValue.test(clean) ? clean : null;
}

export function publicDirectoryDetailUrl(value: string | null | undefined) {
  const clean = usefulDirectoryDetailValue(value);
  if (!clean) return null;
  const candidate = /^https?:\/\//i.test(clean) ? clean : /^[\w.-]+\.[a-z]{2,}(?:\/|$)/i.test(clean) ? `https://${clean}` : null;
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function splitDescription(value: string | null) {
  return value ? value.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean) : [];
}

export function getDirectoryDetailPresentation(profile: PublicDirectoryProfile): DirectoryDetailPresentation {
  const phoneValue = usefulDirectoryDetailValue(importedValue(profile, "Telefón", "Telefon", "phone"));
  const rawEmail = usefulDirectoryDetailValue(importedValue(profile, "E-mail", "Email", "email"));
  const emails = rawEmail?.split(/[;,]/).map((item) => item.trim()).filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)) ?? [];
  const websiteUrl = publicDirectoryDetailUrl(importedValue(profile, "Web", "Webstránka") ?? profile.websiteUrl);
  const facebookUrl = publicDirectoryDetailUrl(importedValue(profile, "Facebook"));
  const instagramUrl = publicDirectoryDetailUrl(importedValue(profile, "Instagram"));
  const navigationQuery = [profile.address, profile.city, profile.district, profile.region, "Slovensko"].filter(Boolean).join(", ");
  const navigationUrl = profile.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(navigationQuery)}` : null;
  const factLabels = [...new Set([...(detailFields[profile.category] ?? []), ...relationFields])];
  const facts = factLabels.flatMap((label) => {
    const value = usefulDirectoryDetailValue(importedValue(profile, label));
    return value ? [{ label, value }] : [];
  });
  const health = profile.category === "veterinari" && facts.length > 0
    ? {
        variant: "veterinari" as const,
        eyebrow: "Zdravie a starostlivosť",
        title: "Veterinárna starostlivosť a vybavenie",
        facts,
      }
    : profile.category === "fyzioterapia" && facts.length > 0
      ? {
          variant: "fyzioterapia" as const,
          eyebrow: "Zdravie a starostlivosť",
          title: "Terapie a rehabilitácia",
          facts,
        }
      : null;
  const coverage = usefulDirectoryDetailValue(importedValue(profile, "Pokrytie", "Oblasť pôsobenia", "Lokalita / pokrytie"));
  const description = profile.description || profile.excerpt || null;

  return {
    id: profile.id,
    slug: profile.slug,
    name: profile.name,
    category: profile.category,
    excerpt: profile.excerpt,
    services: profile.services,
    qualifications: profile.qualifications,
    city: profile.city,
    district: profile.district,
    region: profile.region,
    address: profile.address,
    online: profile.online,
    priceNote: profile.priceNote,
    imageUrl: profile.imageUrl,
    verified: profile.verified,
    featured: profile.featured,
    description,
    descriptionParagraphs: splitDescription(description),
    coverage,
    facts,
    health,
    phone: phoneValue ? { value: phoneValue, href: `tel:${phoneValue.replace(/[^+\d]/g, "")}` } : null,
    emails: emails.map((value) => ({ value, href: `mailto:${value}` })),
    websiteUrl,
    facebookUrl,
    instagramUrl,
    navigationUrl,
  };
}
