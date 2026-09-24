import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const read = (path) => fs.readFile(new URL("../" + path, import.meta.url), "utf8");
const importTs = (path) => import(pathToFileURL(new URL(path, root).pathname).href);

const [
  publicStateSource,
  publicOwnership,
  directoryPage,
  organizationPage,
  directoryDetail,
  claims,
  requestsPage,
  platform,
  worker,
  adminClaimActions,
] = await Promise.all([
  "lib/partner-public-profile.ts",
  "components/partner-public-ownership.tsx",
  "app/adresar/[category]/[slug]/page.tsx",
  "app/organizacie/[slug]/page.tsx",
  "components/directory-profile-detail.tsx",
  "lib/partner-claims.ts",
  "app/partner/ziadosti/page.tsx",
  "lib/partner-platform.ts",
  "worker/index.ts",
  "components/admin-partner-claim-actions.tsx",
].map(read));

function stateDatabase(row) {
  return {
    prepare() {
      return {
        bind() {
          return {
            async first() {
              return row;
            },
          };
        },
      };
    },
  };
}

test("public Partner state model resolves anonymous, eligible, pending, rejected and every active profile role", async () => {
  const { getPublicPartnerProfileManagementState } = await importTs("lib/partner-public-profile.ts");

  const anonymous = await getPublicPartnerProfileManagementState({
    accountId: null,
    entityType: "DIRECTORY_PROFILE",
    canonicalId: 42,
    database: stateDatabase(null),
  });
  assert.deepEqual(anonymous, {
    kind: "anonymous",
    verified: false,
    managementHref: "/partner/prihlasenie?returnTo=%2Fpartner%2Fprevziat-profil%2FDIRECTORY_PROFILE%2F42",
  });

  const eligible = await getPublicPartnerProfileManagementState({
    accountId: "account-a",
    entityType: "DIRECTORY_PROFILE",
    canonicalId: 42,
    database: stateDatabase({
      resourceId: "resource-a",
      membershipRole: null,
      pendingClaimId: null,
      rejectedClaimId: null,
      verified: 0,
    }),
  });
  assert.equal(eligible.kind, "eligible");
  assert.equal(eligible.claimHref, "/partner/prevziat-profil/DIRECTORY_PROFILE/42");

  const pending = await getPublicPartnerProfileManagementState({
    accountId: "account-a",
    entityType: "DIRECTORY_PROFILE",
    canonicalId: 42,
    database: stateDatabase({
      resourceId: "resource-a",
      membershipRole: null,
      pendingClaimId: "claim-pending",
      rejectedClaimId: "claim-old-rejected",
      verified: 0,
    }),
  });
  assert.deepEqual(pending, {
    kind: "pending",
    verified: false,
    requestHref: "/partner/ziadosti",
  });

  const rejected = await getPublicPartnerProfileManagementState({
    accountId: "account-a",
    entityType: "HELP_ORGANIZATION",
    canonicalId: 77,
    database: stateDatabase({
      resourceId: "resource-o",
      membershipRole: null,
      pendingClaimId: null,
      rejectedClaimId: "claim-rejected",
      verified: 0,
    }),
  });
  assert.deepEqual(rejected, {
    kind: "rejected",
    verified: false,
    claimHref: "/partner/prevziat-profil/HELP_ORGANIZATION/77",
    requestHref: "/partner/ziadosti",
  });

  for (const role of ["OWNER", "MANAGER", "EDITOR"]) {
    const member = await getPublicPartnerProfileManagementState({
      accountId: "account-a",
      entityType: "DIRECTORY_PROFILE",
      canonicalId: 42,
      database: stateDatabase({
        resourceId: "resource-a",
        membershipRole: role,
        pendingClaimId: "stale-pending-must-not-win",
        rejectedClaimId: "stale-rejected-must-not-win",
          verified: 1,
      }),
    });
    assert.deepEqual(member, {
      kind: "member",
      verified: true,
      role,
      editHref: "/partner/profily/resource-a/upravit",
      accountHref: "/partner/profily",
    });
  }
});

test("state lookup is account-specific, active-membership-only and uses current indexed lifecycle predicates", () => {
  assert.match(publicStateSource, /m\.account_id=\?3/);
  assert.match(publicStateSource, /m\.revoked_at IS NULL/);
  assert.match(publicStateSource, /pending\.account_id=\?3/);
  assert.match(publicStateSource, /pending\.status='PENDING'/);
  assert.match(publicStateSource, /rejected_candidate\.account_id=\?3/);
  assert.match(publicStateSource, /rejected_candidate\.status='REJECTED'/);
  assert.match(publicStateSource, /verified_account\.status='ACTIVE'/);
  assert.match(publicStateSource, /verified_membership\.revoked_at IS NULL/);
  assert.match(publicStateSource, /verification\.status='VERIFIED'/);
});

test("public UI has one coherent management and correction block with state-dependent copy", () => {
  for (const copy of [
    "Spravujete tento profil?",
    "Spravovať tento profil",
    "Požiadať o správu profilu",
    "Žiadosť o správu profilu čaká na kontrolu.",
    "Predchádzajúca žiadosť bola zamietnutá.",
    "Upraviť profil",
    "Otvoriť Partner účet",
    "Našli ste nesprávny údaj?",
    "Navrhnúť opravu údajov",
  ]) assert.ok(publicOwnership.includes(copy), copy);

  assert.match(publicOwnership, /aria-label="Správa a oprava profilu"/);
  assert.match(publicOwnership, /partner-profile-management-heading/);
  assert.match(publicOwnership, /partner-profile-correction-heading/);
  assert.doesNotMatch(directoryDetail, /Ste majiteľom tohto profilu\?/);
  assert.doesNotMatch(directoryDetail, /Navrhnúť úpravu profilu/);
});

test("Directory and Help Organization profiles share the same server-side state model and keep corrections separate", () => {
  for (const page of [directoryPage, organizationPage]) {
    assert.match(page, /await cookies\(\)/);
    assert.match(page, /PARTNER_SESSION_COOKIE/);
    assert.match(page, /getPartnerSession/);
    assert.match(page, /getPublicPartnerProfileManagementState/);
    assert.match(page, /PartnerPublicOwnership state=\{partnerState\}/);
  }
  assert.match(directoryPage, /entityType: "DIRECTORY_PROFILE"/);
  assert.match(directoryPage, /correctionHref=\{correctionHref\}/);
  assert.match(organizationPage, /entityType: "HELP_ORGANIZATION"/);
  assert.match(organizationPage, /correctionHref="\/opravy-a-podnety"/);
});

test("anonymous management flow preserves the exact profile through the existing safe returnTo contract", () => {
  assert.match(publicStateSource, /normalizePartnerReturnTo\(claimHref\)/);
  assert.match(publicStateSource, /partnerAuthHref\("\/partner\/prihlasenie", returnTo\)/);
  assert.match(publicStateSource, /\/partner\/prevziat-profil\//);
});

test("backend rejects a new ownership request for every active membership role", () => {
  assert.match(claims, /const membership = await activeMembership/);
  assert.match(claims, /if \(membership\) throw new PartnerClaimError\("Tento profil už spravujete cez Partner účet\.", 409\)/);
  assert.doesNotMatch(claims, /membership\?\.role === "OWNER"/);
  for (const role of ["OWNER", "MANAGER", "EDITOR"]) assert.ok(platform.includes(role));
  assert.match(platform, /EDITOR: new Set\(\["RESOURCE_VIEW", "MEMBERSHIP_VIEW", "PROFILE_SUBMIT_CHANGE"/);
  assert.match(platform, /MANAGER: new Set\(\["RESOURCE_VIEW", "MEMBERSHIP_VIEW", "PROFILE_SUBMIT_CHANGE"/);
});

test("rejected state does not leak the admin-only decision note", () => {
  assert.match(adminClaimActions, /Interná poznámka k rozhodnutiu/);
  assert.match(adminClaimActions, /Poznámka zostáva v administrácii a neposiela sa Partnerovi e-mailom\./);
  assert.doesNotMatch(publicStateSource, /decision_note|rejectedDecisionNote/);
  assert.doesNotMatch(requestsPage, /claim\.decisionNote|<strong>Dôvod:<\/strong>/);
  assert.doesNotMatch(publicOwnership, /Pozrieť dôvod|decisionNote|decision_note/);
  assert.match(publicOwnership, /Predchádzajúca žiadosť bola zamietnutá\./);
  assert.match(publicOwnership, /Zobraziť žiadosti/);
});

test("session-specific public profile HTML cannot enter the shared Worker cache", () => {
  assert.match(
    worker,
    /request\.headers\.has\("authorization"\) \|\| request\.headers\.has\("cookie"\) \|\| request\.headers\.has\("cf-access-jwt-assertion"\)/,
  );
  assert.match(directoryPage, /export const dynamic = "force-dynamic"/);
  assert.match(organizationPage, /export const dynamic = "force-dynamic"/);
});
