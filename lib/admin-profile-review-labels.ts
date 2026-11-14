/** Presentation-only Slovak labels for the admin moderation UI.
 * Canonical statuses, entity types, URLs, APIs and transitions stay unchanged. */
const reviewStatusLabels: Record<string, string> = {
  PENDING_REVIEW: "Čaká na kontrolu",
  VISIBLE: "Zverejnená",
  HIDDEN: "Skrytá",
  REJECTED: "Zamietnutá",
  AUTHOR_DELETED: "Odstránená autorom",
  REMOVED: "Odstránená moderátorom",
};

const categoryLabels: Record<string, string> = {
  "chovatelske-stanice": "Chovateľské stanice",
  "veterinari": "Veterinári",
  "treneri": "Tréneri",
  "psie-skoly": "Psie školy",
  "hotely-a-opatrovanie": "Hotely a opatrovanie",
  "salony": "Salóny",
  "fyzioterapia": "Fyzioterapia",
  "kynologicke-kluby": "Kynologické kluby",
  "chovatelske-kluby": "Chovateľské kluby",
  "vencenie": "Venčenie",
};

export function profileReviewStatusLabel(value: string): string {
  return reviewStatusLabels[value] ?? value.replace(/_/g, " ").toLocaleLowerCase("sk");
}

export function profileReviewEntityTypeLabel(value: string): string {
  if (value === "DIRECTORY_PROFILE") return "Profil služby v adresári";
  if (value === "HELP_ORGANIZATION") return "Organizácia pomoci psom";
  return value.replace(/_/g, " ").toLocaleLowerCase("sk");
}

export function profileReviewCategoryLabel(value: string | null | undefined): string {
  if (!value) return "Bez kategórie";
  const slug = value.trim().toLocaleLowerCase("sk");
  return categoryLabels[slug] ?? (slug.charAt(0).toLocaleUpperCase("sk") + slug.slice(1).replace(/[-_]/g, " "));
}

export function profileReviewActionLabel(value: string): string {
  const labels: Record<string, string> = {
    APPROVE: "Schválenie",
    REJECT: "Zamietnutie",
    HIDE: "Skrytie",
    RESTORE: "Obnovenie",
    REMOVE: "Odstránenie",
    REOPEN: "Opätovné otvorenie",
    CREATE: "Vytvorenie recenzie",
    SUBMIT: "Odoslanie recenzie",
  };
  return labels[value] ?? "Zmena recenzie";
}

export function profileReviewActorLabel(value: string): string {
  const labels: Record<string, string> = {
    ADMIN: "Administrátor",
    MODERATOR: "Moderátor",
    USER: "Používateľ",
    AUTHOR: "Autor",
    SYSTEM: "Systém",
  };
  return labels[value] ?? "Zaznamenaná akcia";
}

export function profileReviewAccountStatusLabel(value: string): string {
  const labels: Record<string, string> = {
    ACTIVE: "Aktívny účet",
    PENDING: "Čaká na overenie",
    VERIFIED: "Overený účet",
    SUSPENDED: "Pozastavený účet",
    BLOCKED: "Zablokovaný účet",
    DISABLED: "Deaktivovaný účet",
    DELETED: "Odstránený účet",
  };
  return labels[value] ?? value.replace(/[_-]/g, " ").toLocaleLowerCase("sk");
}

export function profileReviewRiskLabel(value: string): string {
  if (value === "EXCESSIVE_URLS") return "Príliš veľa odkazov";
  if (value === "REPEATED_CHARACTERS") return "Opakujúce sa znaky";
  return "Ďalší rizikový signál";
}

/** Preserve the reason's meaning in audit history without exposing raw codes. */
export function profileReviewReasonLabel(value: string): string {
  const labels: Record<string, string> = {
    SPAM: "Nevyžiadaný obsah",
    OFF_TOPIC: "Nesúvisí s profilom",
    INAPPROPRIATE: "Nevhodný obsah",
    ABUSIVE: "Urážlivý obsah",
    DUPLICATE: "Duplicitná recenzia",
    FRAUD: "Podozrenie na nepravdivé hodnotenie",
    USER_REQUEST: "Žiadosť používateľa",
    POLICY_VIOLATION: "Porušenie pravidiel",
  };
  const readable = value.replace(/[_-]+/g, " ").toLocaleLowerCase("sk").trim();
  return labels[value] ?? (readable ? readable.charAt(0).toLocaleUpperCase("sk") + readable.slice(1) : "Nešpecifikovaný dôvod");
}
