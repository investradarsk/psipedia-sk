import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_ORGANIZATION_FUNDRAISING_VERIFICATION_STATUS,
  ORGANIZATION_FUNDRAISING_METHOD_TYPES,
  ORGANIZATION_FUNDRAISING_OWNERSHIPS,
  ORGANIZATION_FUNDRAISING_VERIFICATION_STATUSES,
  canTransitionOrganizationFundraisingVerification,
  formatIbanForPublicDisplay,
  isOrganizationFundraisingMethodPubliclyEligible,
  isOrganizationFundraisingMethodType,
  isOrganizationFundraisingVerificationStatus,
  isValidIban,
  normalizeIban,
  shouldResetOrganizationFundraisingVerification,
  validateFundraisingUrl,
} from "../lib/organization-fundraising-contract.ts";

const NOW = new Date("2026-09-17T12:00:00.000Z");

function eligibleMethod(overrides = {}) {
  return {
    type: "DONATION_PAGE",
    ownership: "ORGANIZATION_OWNED",
    active: true,
    verificationStatus: "VERIFIED",
    archivedAt: null,
    verificationExpiresAt: "2026-12-31T23:59:59.000Z",
    validUntil: null,
    url: "https://dar.example.sk/podporte-nas",
    value: null,
    ...overrides,
  };
}

test("method taxonomy is the exact ORG-7A v1 allowlist", () => {
  assert.deepEqual(ORGANIZATION_FUNDRAISING_METHOD_TYPES, [
    "MATERIAL_DONATION",
    "DONATION_PAGE",
    "BANK_TRANSFER",
    "TRANSPARENT_ACCOUNT",
    "EXTERNAL_FUNDRAISER",
  ]);
  for (const type of ORGANIZATION_FUNDRAISING_METHOD_TYPES) assert.equal(isOrganizationFundraisingMethodType(type), true);
  for (const type of ["TAX_2_PERCENT", "WISHLIST", "OTHER", "DONIO", "UNKNOWN"]) {
    assert.equal(isOrganizationFundraisingMethodType(type), false);
  }
});

test("ownership contract is intentionally small", () => {
  assert.deepEqual(ORGANIZATION_FUNDRAISING_OWNERSHIPS, ["ORGANIZATION_OWNED", "THIRD_PARTY_CAMPAIGN"]);
});

test("verification lifecycle values and safe default are explicit", () => {
  assert.deepEqual(ORGANIZATION_FUNDRAISING_VERIFICATION_STATUSES, ["UNVERIFIED", "VERIFIED", "STALE", "REJECTED"]);
  assert.equal(DEFAULT_ORGANIZATION_FUNDRAISING_VERIFICATION_STATUS, "UNVERIFIED");
  for (const status of ORGANIZATION_FUNDRAISING_VERIFICATION_STATUSES) {
    assert.equal(isOrganizationFundraisingVerificationStatus(status), true);
  }
  assert.equal(isOrganizationFundraisingVerificationStatus("PUBLISHED"), false);
  assert.equal(canTransitionOrganizationFundraisingVerification("UNVERIFIED", "VERIFIED"), true);
  assert.equal(canTransitionOrganizationFundraisingVerification("VERIFIED", "STALE"), true);
  assert.equal(canTransitionOrganizationFundraisingVerification("REJECTED", "VERIFIED"), false);
  assert.equal(canTransitionOrganizationFundraisingVerification("REJECTED", "UNVERIFIED"), true);
});

test("explicitly verified active method on a published organization is eligible", () => {
  assert.equal(isOrganizationFundraisingMethodPubliclyEligible("PUBLISHED", eligibleMethod(), NOW), true);
});

test("non-published parent never exposes fundraising", () => {
  assert.equal(isOrganizationFundraisingMethodPubliclyEligible("DRAFT", eligibleMethod(), NOW), false);
});

test("inactive method is excluded", () => {
  assert.equal(isOrganizationFundraisingMethodPubliclyEligible("PUBLISHED", eligibleMethod({ active: false }), NOW), false);
});

for (const verificationStatus of ["UNVERIFIED", "STALE", "REJECTED"]) {
  test(`${verificationStatus} method is excluded`, () => {
    assert.equal(
      isOrganizationFundraisingMethodPubliclyEligible("PUBLISHED", eligibleMethod({ verificationStatus }), NOW),
      false,
    );
  });
}

test("archived method is excluded", () => {
  assert.equal(
    isOrganizationFundraisingMethodPubliclyEligible("PUBLISHED", eligibleMethod({ archivedAt: "2026-09-01T00:00:00.000Z" }), NOW),
    false,
  );
});

test("expired verification is excluded and malformed expiry fails closed", () => {
  assert.equal(
    isOrganizationFundraisingMethodPubliclyEligible(
      "PUBLISHED",
      eligibleMethod({ verificationExpiresAt: "2026-09-17T11:59:59.999Z" }),
      NOW,
    ),
    false,
  );
  assert.equal(
    isOrganizationFundraisingMethodPubliclyEligible(
      "PUBLISHED",
      eligibleMethod({ verificationExpiresAt: "not-a-date" }),
      NOW,
    ),
    false,
  );
});

test("expired validUntil is excluded", () => {
  assert.equal(
    isOrganizationFundraisingMethodPubliclyEligible(
      "PUBLISHED",
      eligibleMethod({ validUntil: "2026-09-16T23:59:59.999Z" }),
      NOW,
    ),
    false,
  );
});

test("invalid type or destination is excluded", () => {
  assert.equal(
    isOrganizationFundraisingMethodPubliclyEligible("PUBLISHED", eligibleMethod({ type: "OTHER" }), NOW),
    false,
  );
  assert.equal(
    isOrganizationFundraisingMethodPubliclyEligible("PUBLISHED", eligibleMethod({ url: "http://example.sk" }), NOW),
    false,
  );
});

test("material donation may use verified instructions instead of a URL", () => {
  assert.equal(
    isOrganizationFundraisingMethodPubliclyEligible(
      "PUBLISHED",
      eligibleMethod({ type: "MATERIAL_DONATION", url: null, value: "Krmivo pre psy a deky" }),
      NOW,
    ),
    true,
  );
});

test("bank transfer requires a checksum-valid IBAN", () => {
  assert.equal(
    isOrganizationFundraisingMethodPubliclyEligible(
      "PUBLISHED",
      eligibleMethod({ type: "BANK_TRANSFER", url: null, value: "GB82 WEST 1234 5698 7654 32" }),
      NOW,
    ),
    true,
  );
  assert.equal(
    isOrganizationFundraisingMethodPubliclyEligible(
      "PUBLISHED",
      eligibleMethod({ type: "BANK_TRANSFER", url: null, value: "GB82 WEST 1234 5698 7654 33" }),
      NOW,
    ),
    false,
  );
});

test("HTTPS fundraising URL passes and hostname is normalized", () => {
  assert.deepEqual(validateFundraisingUrl("  https://EXAMPLE.SK/podpora?x=1  "), {
    valid: true,
    normalizedUrl: "https://example.sk/podpora?x=1",
    hostname: "example.sk",
  });
});

test("HTTP and forbidden schemes fail", () => {
  assert.equal(validateFundraisingUrl("http://example.sk").valid, false);
  for (const url of ["javascript:alert(1)", "data:text/plain,hi", "file:///etc/passwd", "ftp://example.sk/file"]) {
    assert.equal(validateFundraisingUrl(url).valid, false);
  }
});

test("credentials in HTTPS URL fail", () => {
  assert.deepEqual(validateFundraisingUrl("https://user:pass@example.sk/path"), {
    valid: false,
    reason: "CREDENTIALS_FORBIDDEN",
  });
});

test("localhost and local hostnames fail", () => {
  for (const url of [
    "https://localhost/",
    "https://api.localhost/",
    "https://printer.local/",
    "https://service.internal/",
    "https://router.lan/",
    "https://home.arpa/",
  ]) {
    assert.equal(validateFundraisingUrl(url).valid, false, url);
  }
});

test("loopback private and link-local IPv4 destinations fail including alternate numeric notation", () => {
  for (const url of [
    "https://127.0.0.1/",
    "https://127.1/",
    "https://2130706433/",
    "https://10.0.0.1/",
    "https://172.16.0.1/",
    "https://192.168.1.1/",
    "https://169.254.169.254/latest/meta-data/",
  ]) {
    assert.equal(validateFundraisingUrl(url).valid, false, url);
  }
});

test("loopback private and link-local IPv6 destinations fail", () => {
  for (const url of [
    "https://[::1]/",
    "https://[fc00::1]/",
    "https://[fd12:3456::1]/",
    "https://[fe80::1]/",
    "https://[::ffff:127.0.0.1]/",
  ]) {
    assert.equal(validateFundraisingUrl(url).valid, false, url);
  }
});

test("public literal IP can pass because validation is syntactic and does not perform network access", () => {
  assert.equal(validateFundraisingUrl("https://8.8.8.8/").valid, true);
  assert.equal(validateFundraisingUrl("https://[2606:4700:4700::1111]/").valid, true);
});

test("IBAN normalization trims whitespace removes spaces and uppercases", () => {
  assert.equal(normalizeIban("  gb82 west 1234 5698 7654 32  "), "GB82WEST12345698765432");
});

test("ISO 13616 mod-97 accepts valid checksum and rejects invalid checksum", () => {
  assert.equal(isValidIban("GB82 WEST 1234 5698 7654 32"), true);
  assert.equal(isValidIban("DE89 3704 0044 0532 0130 00"), true);
  assert.equal(isValidIban("GB82 WEST 1234 5698 7654 33"), false);
  assert.equal(isValidIban("NOT-AN-IBAN"), false);
});

test("public IBAN formatting groups a validated IBAN by four", () => {
  assert.equal(formatIbanForPublicDisplay("gb82west12345698765432"), "GB82 WEST 1234 5698 7654 32");
  assert.equal(formatIbanForPublicDisplay("bad"), null);
});

test("sensitive type URL value ownership and beneficiary edits reset verification", () => {
  const base = {
    type: "BANK_TRANSFER",
    ownership: "ORGANIZATION_OWNED",
    url: null,
    value: "GB82 WEST 1234 5698 7654 32",
    beneficiaryIdentity: "Psia nádej, o.z.",
  };
  assert.equal(shouldResetOrganizationFundraisingVerification(base, { ...base, type: "TRANSPARENT_ACCOUNT" }), true);
  assert.equal(shouldResetOrganizationFundraisingVerification(base, { ...base, url: "https://example.sk/account" }), true);
  assert.equal(shouldResetOrganizationFundraisingVerification(base, { ...base, value: "DE89 3704 0044 0532 0130 00" }), true);
  assert.equal(shouldResetOrganizationFundraisingVerification(base, { ...base, ownership: "THIRD_PARTY_CAMPAIGN" }), true);
  assert.equal(shouldResetOrganizationFundraisingVerification(base, { ...base, beneficiaryIdentity: "Iné OZ" }), true);
});

test("semantic URL/IBAN normalization and cosmetic label/order edits do not reset verification", () => {
  const previous = {
    type: "BANK_TRANSFER",
    ownership: "ORGANIZATION_OWNED",
    url: "https://EXAMPLE.sk",
    value: "gb82 west 1234 5698 7654 32",
    beneficiaryIdentity: "  Psia   Nádej, O.Z. ",
    label: "Podporte nás",
    sortOrder: 1,
  };
  const next = {
    ...previous,
    url: "https://example.sk/",
    value: "GB82WEST12345698765432",
    beneficiaryIdentity: "psia nádej, o.z.",
    label: "Pomôžte nám",
    sortOrder: 9,
  };
  assert.equal(shouldResetOrganizationFundraisingVerification(previous, next), false);
});
