import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL("../"+path,import.meta.url), "utf8");
const [domain,createApi,withdrawApi,form,page,requests,dashboard,admin,attention,adminHome,documentation] = await Promise.all([
  "lib/partner-help-create.ts","app/api/partner/help-submissions/route.ts",
  "app/api/partner/help-submissions/[id]/route.ts","components/partner-help-create-form.tsx",
  "app/partner/pomoc/nova/page.tsx","app/partner/ziadosti/page.tsx",
  "app/partner/page.tsx","app/admin/partners/help-submissions/page.tsx",
  "lib/partner-attention.ts","app/admin/partners/page.tsx",
  "docs/PARTNER-SELF-SERVICE-STEP4.md",
].map(read));

test("Step 4 covers exactly the three canonical Help areas and all four case categories",()=>{
  for(const type of ["ADOPTION_DOG","LOST_FOUND_DOG","HELP_CASE"]) {
    assert.match(domain,new RegExp(type));
    assert.match(form,new RegExp(type));
  }
  for(const category of ["docasna-opatera","zbierky","dobrovolnictvo","urgentne-pripady"]) {
    assert.ok(domain.includes(category));
    assert.ok(form.includes(category));
  }
  assert.match(domain,/normalizePartnerHelpCreate/);
  assert.match(domain,/reject|illegal/);
  assert.match(domain,/published|Publikáciu/);
  assert.match(domain,/validDate/);
});
test("Step 4 creates only moderated CREATE proposals, not prematurely published canonical data",()=>{
  const submit=domain.slice(domain.indexOf("export async function submitPartnerHelpCreate"),domain.indexOf("export async function withdrawPartnerHelpCreate"));
  assert.match(submit,/INSERT INTO moderation_submissions/);
  assert.match(submit,/INSERT INTO moderation_events/);
  assert.match(submit,/NEW_PROFILE_SUBMITTED/);
  assert.match(submit,/SUBMITTED/);
  assert.match(submit,/canonicalDuplicate/);
  assert.match(submit,/ACTIVE_DUPLICATE_SUBMISSION/);
  assert.match(submit,/WHERE NOT EXISTS/);
  assert.match(submit,/results\[0\]\?\.meta\?\.changes/);
  assert.match(submit,/enforcePartnerNewProfileRateLimit/);
  assert.doesNotMatch(submit,/INSERT INTO (adoption_dogs|lost_found_dog_reports|help_cases)/);
  assert.doesNotMatch(submit,/UPDATE (adoption_dogs|lost_found_dog_reports|help_cases)/);
  assert.match(documentation,/bez automatickej publikácie/);
});
test("Mutations require verified authenticated Partner and explicit same-origin JSON",()=>{
  for(const route of [createApi,withdrawApi]){
    assert.match(route,/requirePartnerAccount/);
    assert.match(route,/assertPartnerJsonMutation/);
    assert.match(route,/cookieHeader: request.headers.get\("cookie"\)/);
    assert.match(route,/Cache-Control/);
  }
  assert.match(domain,/partner_accounts WHERE id=\?1/);
  assert.match(domain,/account\?\.status !== "ACTIVE"/);
  assert.match(domain,/submitter_ref=\?2/);
  assert.match(domain,/applyAtomicModerationTransition/);
  assert.match(domain,/canTransitionModerationSubmission/);
});
test("UX makes Help submission discoverable and tracks it in account and admin queue",()=>{
  assert.match(page,/requirePartnerPageIdentity/);
  assert.match(form,/Odoslať na kontrolu/);
  assert.match(form,/partner\/ziadosti/);
  assert.match(requests,/listPartnerHelpCreateSubmissions\(identity.accountId\)/);
  assert.match(requests,/PartnerHelpWithdrawButton/);
  assert.match(dashboard,/listPartnerHelpCreateSubmissions\(identity.accountId\)/);
  assert.match(dashboard,/helpSubmissions/);
  assert.match(admin,/requireAdminPageUser/);
  assert.match(admin,/listPartnerHelpCreateAdmin/);
  assert.match(attention,/helpSubmissions/);
  assert.match(adminHome,/\/admin\/partners\/help-submissions/);
  assert.match(domain,/enqueueAdminNotificationEvent/);
});
