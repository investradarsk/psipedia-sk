/**
 * Verified, publicly attributable business facts only.
 * Pure ESM: the GitHub Actions worker has no Psipedia runtime.
 * Never derive SEO, publishing, GEO or synchronization fields.
 */
const safeText = (value, max = 500) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const safeUrl = (value) => {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return "";
    if (!url.hostname.includes(".") || url.hostname.endsWith(".local")) return "";
    return url.toString();
  } catch { return ""; }
};
const socialUrl = (value, host) => {
  const url = safeUrl(value);
  if (!url) return "";
  const parsed = new URL(url);
  return parsed.hostname === host || parsed.hostname.endsWith("." + host) ? url : "";
};
const validEmail = (value) => {
  const email = safeText(value, 254);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
};
const validPhone = (value) => {
  const phone = safeText(value, 35);
  const digits = phone.replace(/\D/g, "");
  return /^[+\d][\d\s().\/-]{5,34}$/.test(phone)
    && digits.length >= 7 && digits.length <= 15 ? phone : "";
};
const validPostalCode = (value) => {
  const code = safeText(value, 12);
  return /^\d{3}\s?\d{2}$/.test(code) ? code.replace(/\s/g, "").replace(/^(\d{3})/, "$1 ") : "";
};
const validHouseNumber = (value) => {
  const number = safeText(value, 24);
  return /^\d{1,6}(?:\/\d{1,6})?[a-zA-Z]?$/.test(number) ? number : "";
};

export function directoryProfileValues(args) {
  const values = {
    "Telefón": validPhone(args.phone),
    "E-mail": validEmail(args.email),
    "Adresa": safeText(args.address, 250),
    "Ulica": safeText(args.street, 150),
    "Číslo domu": validHouseNumber(args.house_number),
    "PSČ": validPostalCode(args.postal_code),
    "Okres": safeText(args.district, 100),
    "Kraj": safeText(args.region, 100),
    "Facebook": socialUrl(args.facebook_url, "facebook.com"),
    "Instagram": socialUrl(args.instagram_url, "instagram.com"),
    "Služby": safeText(args.services, 1600),
    "Kvalifikácie": safeText(args.qualifications, 600),
  };
  return Object.fromEntries(Object.entries(values).filter(([, value]) => !!value));
}

/** Veterinarians require at least two independently useful contact/address
 * fields; do not create attractive but practically unusable shells. The address
 * must be supplied as a full address or street + validated house number.
 * Called on actual Notion-encoded properties, not untrusted model arguments.
 */
export function hasMinimumVeterinarianContact(properties) {
  return Number(!!properties["Telefón"]) + Number(!!properties["E-mail"]) +
    Number(!!properties["Adresa"] || (!!properties["Ulica"] && !!properties["Číslo domu"])) >= 2;
}
