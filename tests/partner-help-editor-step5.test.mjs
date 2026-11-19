import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { pathToFileURL } from "node:url";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const contract = await import(pathToFileURL(new URL("../lib/partner-help-editor-fields.ts",import.meta.url).pathname).href);

test("Step 5 uses exactly three canonical Help tables and a shared public field vocabulary",()=>{
  assert.deepEqual(Object.keys(contract.helpEditorFields),["ADOPTION_DOG","LOST_FOUND_DOG","HELP_CASE"]);
  assert.ok(contract.helpEditorFields.ADOPTION_DOG.length >= 25);
  assert.ok(contract.helpEditorFields.LOST_FOUND_DOG.length >= 12);
  assert.ok(contract.helpEditorFields.HELP_CASE.length >= 15);
  for(const type of Object.keys(contract.helpEditorFields)){
    const keys=contract.helpEditorFields[type].map(field=>field.key);
    assert.equal(new Set(keys).size,keys.length);
    for(const banned of ["status","slug","id","published_at","updated_at","seo_json","created_by","owner_id",
      "public_latitude","public_longitude","private_note_encrypted","verified","duplicate_reason","source"]) {
      assert.ok(!keys.includes(banned),type+" cannot edit protected field "+banned);
    }
  }
});

test("Help editor updates only changed public fields and rejects system/SEO/private keys",()=>{
  const valid=contract.normalizeHelpEditorPatch("ADOPTION_DOG",{name:"Bela", approximate_age_months:9,
    sex:"FEMALE",breed_mix:true,contact_phone:"kontakt prosím"});
  assert.deepEqual(valid,{name:"Bela",approximate_age_months:9,sex:"FEMALE",breed_mix:true,contact_phone:"kontakt prosím"});
  for(const type of Object.keys(contract.helpEditorFields)){
    for(const forbidden of ["status","seo_json","slug","published_at","updated_by","owner_id"]) {
      assert.throws(()=>contract.normalizeHelpEditorPatch(type,{[forbidden]:"published"}),/nie je možné upraviť/);
    }
  }
  assert.throws(()=>contract.normalizeHelpEditorPatch("ADOPTION_DOG",{sex:"DRAGON"}),/Neplatná možnosť/);
  assert.deepEqual(contract.normalizeHelpEditorPatch("ADOPTION_DOG",{chipped:null,neutered:true,apartment_suitable:false}),{chipped:null,neutered:true,apartment_suitable:false});
  assert.throws(()=>contract.normalizeHelpEditorPatch("ADOPTION_DOG",{chipped:"maybe"}),/Neplatná hodnota/);
  assert.deepEqual(contract.normalizeHelpEditorPatch("LOST_FOUND_DOG",{public_phone:"hocijaký text",short_description:"Nájdený pes"}),{public_phone:"hocijaký text",short_description:"Nájdený pes"});
  assert.throws(()=>contract.normalizeHelpEditorPatch("ADOPTION_DOG",{name:""}),/Povinné pole/);
  assert.throws(()=>contract.normalizeHelpEditorPatch("ADOPTION_DOG",{approximate_age_months:-1}),/Neplatná číselná/);
  assert.throws(()=>contract.normalizeHelpEditorPatch("LOST_FOUND_DOG",{event_date:"2026-02-31"}),/Neplatný dátum/);
  assert.throws(()=>contract.normalizeHelpEditorPatch("HELP_CASE",{"public_latitude":40}),/nie je možné upraviť/);
  assert.throws(()=>contract.normalizeHelpEditorPatch("HELP_CASE",{action_url:"javascript:alert(1)"}),/bezpečný/);
  assert.throws(()=>contract.normalizeHelpEditorPatch("HELP_CASE",{description:"<script>alert(1)</script>"}),/HTML/);
  assert.throws(()=>contract.normalizeHelpEditorPatch("HELP_CASE",{}),/Nezmenili ste/);
  assert.deepEqual(contract.normalizeHelpEditorPatch("HELP_CASE",{},true),{});
});

test("Step 5 mutation is guarded by active approved owner and optimistic record version",async()=>{
  const [domain,platform,api]=await Promise.all([
    "lib/partner-help-editor.ts","lib/partner-platform.ts","app/api/partner/help-records/[resourceId]/route.ts",
  ].map(read));
  assert.match(domain,/parseHelpResourceId/);
  assert.match(domain,/requirePartnerPermission\(accountId, resourceId, "HELP_EDIT_PUBLIC"/);
  assert.match(domain,/requirePartnerPermission\(input.accountId, input.resourceId, "HELP_EDIT_PUBLIC"/);
  assert.match(domain,/updated_at=\?/);
  assert.match(domain,/c.status='APPROVED'/);
  assert.match(domain,/a.status='ACTIVE'/);
  assert.match(domain,/c.account_id=\?/);
  assert.match(domain,/database.batch/);
  assert.match(domain,/PROFILE_CHANGE_APPROVED/);
  assert.match(domain,/DIRECT_PUBLIC_SAVE/);
  assert.match(domain,/mediaReady/);
  assert.match(domain,/publishSafeImage/);
  assert.match(domain,/main_image_key/);
  assert.doesNotMatch(domain,/UPDATE partner_help_claims SET status/);
  assert.match(platform,/HELP_EDIT_PUBLIC/);
  assert.match(api,/requirePartnerAccount/);
  assert.match(api,/assertPartnerJsonMutation/);
  assert.match(api,/onboardingComplete/);
  assert.match(api,/HelpEditorValidationError/);
});

test("Approved Help editor is linked from managed resources and uses shared media/gallery upload",async()=>{
  const [dashboard,profiles,page,form,media,gallery,intents]=await Promise.all([
    "app/partner/page.tsx","app/partner/profily/page.tsx",
    "app/partner/pomoc/[resourceId]/upravit/page.tsx","components/partner-help-public-editor-form.tsx",
    "components/partner-media-field.tsx","components/partner-gallery-field.tsx","lib/partner-media.ts",
  ].map(read));
  assert.match(dashboard,/\/partner\/pomoc\/\$\{id\}\/upravit/);
  assert.match(profiles,/\/partner\/pomoc\/\$\{encodeURIComponent\(item.resourceId\)\}\/upravit/);
  assert.match(page,/requirePartnerPageIdentity\(\)/);
  assert.match(page,/getPartnerHelpEditor\(identity.accountId, resourceId\)/);
  assert.match(form,/PartnerMediaField/);
  assert.match(form,/PartnerGalleryField/);
  assert.match(form,/PARTNER_HELP_UPDATE/);
  assert.match(intents,/PARTNER_HELP_UPDATE/);
  assert.match(media,/directPublish/);
  assert.match(gallery,/mediaIntent/);
  assert.match(form,/baseRevision:revision/);
  assert.match(form,/Uložiť zmeny/);
  assert.doesNotMatch(form,/admin\/api|\/api\/admin\//);
});
