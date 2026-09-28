export const ORGANIZATION_FUNDRAISING_METHOD_TYPES = [
  "MATERIAL_DONATION",
  "DONATION_PAGE",
  "BANK_TRANSFER",
  "TRANSPARENT_ACCOUNT",
  "EXTERNAL_FUNDRAISER",
] as const;

export type OrganizationFundraisingMethodType = typeof ORGANIZATION_FUNDRAISING_METHOD_TYPES[number];

export const PUBLIC_ORGANIZATION_FUNDRAISING_METHOD_TYPES = ORGANIZATION_FUNDRAISING_METHOD_TYPES;

export const ORGANIZATION_FUNDRAISING_OWNERSHIPS = [
  "ORGANIZATION_OWNED",
  "THIRD_PARTY_CAMPAIGN",
] as const;

export type OrganizationFundraisingOwnership = typeof ORGANIZATION_FUNDRAISING_OWNERSHIPS[number];

export const ORGANIZATION_FUNDRAISING_VERIFICATION_STATUSES = [
  "UNVERIFIED",
  "VERIFIED",
  "STALE",
  "REJECTED",
] as const;

export type OrganizationFundraisingVerificationStatus =
  typeof ORGANIZATION_FUNDRAISING_VERIFICATION_STATUSES[number];

export const DEFAULT_ORGANIZATION_FUNDRAISING_VERIFICATION_STATUS = "UNVERIFIED" as const;

type FundraisingVerificationTransitionMap = Readonly<
  Record<OrganizationFundraisingVerificationStatus, readonly OrganizationFundraisingVerificationStatus[]>
>;

export const ORGANIZATION_FUNDRAISING_VERIFICATION_TRANSITIONS: FundraisingVerificationTransitionMap = {
  UNVERIFIED: ["UNVERIFIED", "VERIFIED", "REJECTED"],
  VERIFIED: ["VERIFIED", "UNVERIFIED", "STALE", "REJECTED"],
  STALE: ["STALE", "UNVERIFIED", "VERIFIED", "REJECTED"],
  REJECTED: ["REJECTED", "UNVERIFIED"],
};

export function isOrganizationFundraisingMethodType(value: unknown): value is OrganizationFundraisingMethodType {
  return typeof value === "string"
    && (ORGANIZATION_FUNDRAISING_METHOD_TYPES as readonly string[]).includes(value);
}

export function isPublicOrganizationFundraisingMethodType(
  value: unknown,
): value is OrganizationFundraisingMethodType {
  return isOrganizationFundraisingMethodType(value);
}

export function isOrganizationFundraisingOwnership(value: unknown): value is OrganizationFundraisingOwnership {
  return typeof value === "string"
    && (ORGANIZATION_FUNDRAISING_OWNERSHIPS as readonly string[]).includes(value);
}

export function isOrganizationFundraisingVerificationStatus(
  value: unknown,
): value is OrganizationFundraisingVerificationStatus {
  return typeof value === "string"
    && (ORGANIZATION_FUNDRAISING_VERIFICATION_STATUSES as readonly string[]).includes(value);
}

export function canTransitionOrganizationFundraisingVerification(
  from: unknown,
  to: unknown,
): boolean {
  if (!isOrganizationFundraisingVerificationStatus(from) || !isOrganizationFundraisingVerificationStatus(to)) {
    return false;
  }
  return ORGANIZATION_FUNDRAISING_VERIFICATION_TRANSITIONS[from].includes(to);
}

export type FundraisingUrlValidationFailureReason =
  | "MISSING_URL"
  | "INVALID_URL"
  | "HTTPS_REQUIRED"
  | "CREDENTIALS_FORBIDDEN"
  | "LOCAL_DESTINATION_FORBIDDEN"
  | "PRIVATE_DESTINATION_FORBIDDEN";

export type FundraisingUrlValidationResult =
  | { valid: true; normalizedUrl: string; hostname: string }
  | { valid: false; reason: FundraisingUrlValidationFailureReason };

function normalizedText(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function parseIpv4(hostname: string): number[] | null {
  const parts = hostname.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    octets.push(octet);
  }
  return octets;
}

function ipv4Number(octets: readonly number[]) {
  return (((octets[0]! * 256 + octets[1]!) * 256 + octets[2]!) * 256 + octets[3]!) >>> 0;
}

function inIpv4Cidr(octets: readonly number[], base: number, prefix: number) {
  const value = ipv4Number(octets);
  if (prefix === 0) return true;
  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (base & mask);
}

function isNonPublicIpv4(octets: readonly number[]) {
  const ranges: ReadonlyArray<readonly [number, number]> = [
    [0x00000000, 8],
    [0x0a000000, 8],
    [0x64400000, 10],
    [0x7f000000, 8],
    [0xa9fe0000, 16],
    [0xac100000, 12],
    [0xc0000000, 24],
    [0xc0000200, 24],
    [0xc0a80000, 16],
    [0xc6120000, 15],
    [0xc6336400, 24],
    [0xcb007100, 24],
    [0xe0000000, 4],
    [0xf0000000, 4],
  ];
  return ranges.some(([base, prefix]) => inIpv4Cidr(octets, base, prefix));
}

function parseIpv6(address: string): bigint | null {
  const normalized = address.toLowerCase();
  if (!/^[0-9a-f:]+$/.test(normalized)) return null;
  if ((normalized.match(/::/g) ?? []).length > 1) return null;

  const [leftRaw, rightRaw] = normalized.split("::");
  const left = leftRaw ? leftRaw.split(":") : [];
  const right = rightRaw !== undefined && rightRaw ? rightRaw.split(":") : [];
  if (left.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  if (right.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;

  let groups: string[];
  if (rightRaw !== undefined) {
    const missing = 8 - left.length - right.length;
    if (missing < 1) return null;
    groups = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  } else {
    if (left.length !== 8) return null;
    groups = left;
  }

  let value = 0n;
  for (const group of groups) value = (value << 16n) + BigInt(`0x${group}`);
  return value;
}

function inIpv6Cidr(value: bigint, base: bigint, prefix: number) {
  if (prefix === 0) return true;
  const shift = BigInt(128 - prefix);
  return (value >> shift) === (base >> shift);
}

const IPV6_UNSPECIFIED = 0n;
const IPV6_LOOPBACK = 1n;
const IPV6_UNIQUE_LOCAL = parseIpv6("fc00::")!;
const IPV6_LINK_LOCAL = parseIpv6("fe80::")!;
const IPV6_MULTICAST = parseIpv6("ff00::")!;
const IPV6_DOCUMENTATION = parseIpv6("2001:db8::")!;

function isNonPublicIpv6(value: bigint) {
  if (value === IPV6_UNSPECIFIED || value === IPV6_LOOPBACK) return true;
  if (inIpv6Cidr(value, IPV6_UNIQUE_LOCAL, 7)) return true;
  if (inIpv6Cidr(value, IPV6_LINK_LOCAL, 10)) return true;
  if (inIpv6Cidr(value, IPV6_MULTICAST, 8)) return true;
  if (inIpv6Cidr(value, IPV6_DOCUMENTATION, 32)) return true;

  const upper96 = value >> 32n;
  if (upper96 === 0xffffn || upper96 === 0n) {
    const ipv4 = Number(value & 0xffffffffn);
    const octets = [
      (ipv4 >>> 24) & 0xff,
      (ipv4 >>> 16) & 0xff,
      (ipv4 >>> 8) & 0xff,
      ipv4 & 0xff,
    ];
    if (isNonPublicIpv4(octets)) return true;
  }

  return false;
}

function isLocalHostname(hostname: string) {
  return hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname.endsWith(".local")
    || hostname.endsWith(".internal")
    || hostname.endsWith(".lan")
    || hostname.endsWith(".home")
    || hostname === "home.arpa"
    || hostname.endsWith(".home.arpa");
}

export function validateFundraisingUrl(value: unknown): FundraisingUrlValidationResult {
  const input = normalizedText(value);
  if (!input) return { valid: false, reason: "MISSING_URL" };

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { valid: false, reason: "INVALID_URL" };
  }

  if (url.protocol !== "https:") return { valid: false, reason: "HTTPS_REQUIRED" };
  if (url.username || url.password) return { valid: false, reason: "CREDENTIALS_FORBIDDEN" };

  const hostname = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (!hostname) return { valid: false, reason: "INVALID_URL" };
  if (isLocalHostname(hostname)) return { valid: false, reason: "LOCAL_DESTINATION_FORBIDDEN" };

  const ipv4 = parseIpv4(hostname);
  if (ipv4 && isNonPublicIpv4(ipv4)) {
    return { valid: false, reason: "PRIVATE_DESTINATION_FORBIDDEN" };
  }

  const ipv6 = hostname.includes(":") ? parseIpv6(hostname) : null;
  if (ipv6 !== null && isNonPublicIpv6(ipv6)) {
    return { valid: false, reason: "PRIVATE_DESTINATION_FORBIDDEN" };
  }

  url.hostname = hostname;
  return { valid: true, normalizedUrl: url.toString(), hostname };
}

export function normalizeIban(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, "").toUpperCase();
}

export function isValidIban(value: unknown) {
  const iban = normalizeIban(value);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  if (iban.length < 15 || iban.length > 34) return false;

  const rearranged = `${iban.slice(4)}${iban.slice(0, 4)}`;
  let remainder = 0;
  for (const character of rearranged) {
    const numeric = character >= "A" && character <= "Z"
      ? String(character.charCodeAt(0) - 55)
      : character;
    for (const digit of numeric) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

export function formatIbanForPublicDisplay(value: unknown) {
  const iban = normalizeIban(value);
  if (!isValidIban(iban)) return null;
  return iban.match(/.{1,4}/g)?.join(" ") ?? iban;
}

function isSafeStructuredValue(value: unknown) {
  const normalized = normalizedText(value);
  if (!normalized) return false;
  return !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(normalized);
}

export type OrganizationFundraisingDestination = {
  type: unknown;
  url?: unknown;
  value?: unknown;
};

export function isValidOrganizationFundraisingDestination(
  method: OrganizationFundraisingDestination,
): boolean {
  if (!isOrganizationFundraisingMethodType(method.type)) return false;

  const urlText = normalizedText(method.url);
  const urlResult = urlText ? validateFundraisingUrl(urlText) : null;
  if (urlText && !urlResult?.valid) return false;

  switch (method.type) {
    case "MATERIAL_DONATION":
      return Boolean(urlResult?.valid || isSafeStructuredValue(method.value));
    case "DONATION_PAGE":
    case "EXTERNAL_FUNDRAISER":
      return Boolean(urlResult?.valid);
    case "BANK_TRANSFER":
      return isValidIban(method.value);
    case "TRANSPARENT_ACCOUNT":
      return Boolean(urlResult?.valid) && (normalizedText(method.value) ? isValidIban(method.value) : true);
  }
}

export type PublicOrganizationFundraisingEligibilityInput = OrganizationFundraisingDestination & {
  ownership: unknown;
  active: boolean;
  verificationStatus: unknown;
  archivedAt?: unknown;
  verificationExpiresAt?: unknown;
  validUntil?: unknown;
};

function timestampIsCurrentOrFuture(value: unknown, nowMs: number) {
  if (value === null || value === undefined || value === "") return true;
  const parsed = value instanceof Date ? value.getTime() : typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= nowMs;
}

export function isOrganizationFundraisingMethodPubliclyEligible(
  parentOrganizationStatus: unknown,
  method: PublicOrganizationFundraisingEligibilityInput,
  now: Date = new Date(),
): boolean {
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) return false;
  if (parentOrganizationStatus !== "PUBLISHED") return false;
  if (method.active !== true) return false;
  if (method.verificationStatus !== "VERIFIED") return false;
  if (!isOrganizationFundraisingVerificationStatus(method.verificationStatus)) return false;
  if (!isOrganizationFundraisingOwnership(method.ownership)) return false;
  if (method.archivedAt !== null && method.archivedAt !== undefined && method.archivedAt !== "") return false;
  if (!timestampIsCurrentOrFuture(method.verificationExpiresAt, nowMs)) return false;
  if (!timestampIsCurrentOrFuture(method.validUntil, nowMs)) return false;
  if (!isPublicOrganizationFundraisingMethodType(method.type)) return false;
  return isValidOrganizationFundraisingDestination(method);
}

export type FundraisingVerificationSensitiveSnapshot = {
  type?: unknown;
  url?: unknown;
  value?: unknown;
  ownership?: unknown;
  beneficiaryIdentity?: unknown;
};

function normalizedNullableText(value: unknown) {
  return normalizedText(value) ?? "";
}

function normalizedBeneficiaryIdentity(value: unknown) {
  return normalizedNullableText(value).replace(/\s+/g, " ").toLowerCase();
}

function normalizedSensitiveUrl(value: unknown) {
  const text = normalizedNullableText(value);
  if (!text) return "";
  const validation = validateFundraisingUrl(text);
  return validation.valid ? validation.normalizedUrl : text;
}

function normalizedSensitiveValue(type: unknown, value: unknown) {
  if (type === "BANK_TRANSFER" || type === "TRANSPARENT_ACCOUNT") return normalizeIban(value);
  return normalizedNullableText(value).replace(/\r\n/g, "\n");
}

export function shouldResetOrganizationFundraisingVerification(
  previous: FundraisingVerificationSensitiveSnapshot,
  next: FundraisingVerificationSensitiveSnapshot,
): boolean {
  if (previous.type !== next.type) return true;
  if (previous.ownership !== next.ownership) return true;
  if (normalizedSensitiveUrl(previous.url) !== normalizedSensitiveUrl(next.url)) return true;
  if (normalizedSensitiveValue(previous.type, previous.value) !== normalizedSensitiveValue(next.type, next.value)) return true;
  if (normalizedBeneficiaryIdentity(previous.beneficiaryIdentity)
      !== normalizedBeneficiaryIdentity(next.beneficiaryIdentity)) return true;
  return false;
}
