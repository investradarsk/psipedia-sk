// Pure deterministic identity checks, no network and no model calls.
export const normalizeIdentity = value => String(value ?? "").normalize("NFKD").toLowerCase()
  .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const nameKey = value => normalizeIdentity(value).replace(/\b(s r o|a s|spol|mvdr|mudr)\b/g, "").replace(/\s/g, "");
export function canonicalIdentityUrl(value) {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol)) return "";
    return url.hostname.toLowerCase().replace(/^www\./, "") +
      url.pathname.replace(/\/+$/, "").replace(/\/(index\.(html?|php)|kontakt|contact|o-nas)$/i, "");
  } catch { return ""; }
}
export function sameDirectoryIdentity(a, b) {
  const sameTown = normalizeIdentity(a.city) && normalizeIdentity(a.city) === normalizeIdentity(b.city);
  const differentTown = normalizeIdentity(a.city) && normalizeIdentity(b.city) && !sameTown;
  const sameName = nameKey(a.name) && nameKey(a.name) === nameKey(b.name);
  const urlsA = [a.website, a.source].map(canonicalIdentityUrl).filter(Boolean);
  const urlsB = [b.website, b.source].map(canonicalIdentityUrl).filter(Boolean);
  const sameUrl = urlsA.some(url => urlsB.includes(url));
  const phone = value => String(value ?? "").replace(/\D/g, "").replace(/^00/, "").replace(/^421/, "0");
  const samePhone = phone(a.phone).length >= 9 && phone(a.phone) === phone(b.phone);
  const sameEmail = a.email && String(a.email).toLowerCase() === String(b.email).toLowerCase();
  // Shared chains/domains are not enough to collapse different locations.
  if (differentTown) return false;
  if (sameName && (sameTown || sameUrl || samePhone || sameEmail)) return true;
  // Rebrands with the same website need corroboration: city or direct contact.
  if (sameUrl && (sameTown || samePhone || sameEmail)) return true;
  if (sameTown && samePhone && sameEmail) return true;
  return false;
}
export function identityPageText(page, key) {
  const p = page.properties?.[key];
  return (p?.title ?? p?.rich_text)?.map(item => item.plain_text ?? item.text?.content ?? "").join("") ??
    p?.url ?? p?.email ?? p?.phone_number ?? p?.select?.name ?? "";
}
export function pageDirectoryIdentities(page) {
  const current = { name: identityPageText(page, "Názov"), city: identityPageText(page, "Mesto"),
    website: identityPageText(page, "Web"), source: identityPageText(page, "Zdroj dát"),
    phone: identityPageText(page, "Telefón"), email: identityPageText(page, "E-mail") };
  const historical = identityPageText(page, "Poznámky").split("\n").flatMap(line => {
    const prefix = "[Psipedia Gemini review] ";
    if (!line.startsWith(prefix)) return [];
    try { const event = JSON.parse(line.slice(prefix.length));
      return event.identity && typeof event.identity.name === "string" ? [event.identity] : [];
    } catch { return []; }
  });
  return [current, ...historical];
}
export function directoryDuplicate(rows, candidate) {
  // Includes all Notion rows: drafts, published and archived/rejected records.
  return rows.some(page => pageDirectoryIdentities(page).some(known => sameDirectoryIdentity(candidate, known)));
}
