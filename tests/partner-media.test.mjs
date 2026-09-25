import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root=new URL("../",import.meta.url);
const read=(path)=>fs.readFile(new URL("../"+path,import.meta.url),"utf8");
const importTs=(path)=>import(pathToFileURL(new URL(path,root).pathname).href);

const [
  migration,privateMedia,partnerMedia,security,upload,partnerPreview,adminPreview,publicMedia,
  newProfile,profileChanges,events,newProfileAdmin,profileChangesAdmin,eventsAdmin,
  newProfileForm,profileEditForm,eventForm,mediaField,partnerCss,adminCss,worker,
]=await Promise.all([
  "drizzle/0072_partner_media_uploads.sql","lib/private-media.ts","lib/partner-media.ts","lib/partner-security.ts",
  "app/api/partner/media/route.ts","app/api/partner/media/[id]/route.ts","app/api/admin/partners/media/[id]/route.ts","app/media/[...key]/route.ts",
  "lib/partner-new-profile.ts","lib/partner-profile-changes.ts","lib/partner-events.ts",
  "lib/partner-new-profile-admin.ts","lib/partner-profile-changes-admin.ts","lib/partner-events-admin.ts",
  "components/partner-new-profile-form.tsx","components/partner-profile-edit-form.tsx","components/partner-event-form.tsx",
  "components/partner-media-field.tsx","app/partner/partner.css","app/admin/partners/partners.css","worker/index.ts",
].map(read));

test("0072 binds exactly one staged media asset to a Partner moderation submission with DB ownership and intent guards",()=>{
  assert.match(migration,/ADD COLUMN `media_asset_id` text REFERENCES `media_assets`/);
  assert.match(migration,/moderation_submissions_media_asset_unique/);
  assert.match(migration,/BEFORE INSERT ON `moderation_submissions`/);
  assert.match(migration,/NEW.`submitter_type` <> 'PARTNER_ACCOUNT'/);
  assert.match(migration,/m.`owner_id` = NEW.`submitter_ref`/);
  assert.match(migration,/m.`state` = 'PENDING'/);
  for(const intent of ["PARTNER_PROFILE_CREATE","PARTNER_PROFILE_UPDATE","PARTNER_EVENT_CREATE","PARTNER_EVENT_UPDATE"])assert.match(migration,new RegExp(intent));
  assert.match(migration,/AFTER INSERT ON `moderation_submissions`/);
  assert.match(migration,/SET `state`='ATTACHED'/);
  assert.doesNotMatch(migration,/UPDATE `directory_profiles`|UPDATE `help_organizations`|UPDATE `managed_events`/);
});

test("private image pipeline accepts only JPEG PNG WebP, validates bytes and dimensions, strips metadata and writes safe WebP",async()=>{
  const mod=await importTs("lib/private-media.ts");
  assert.equal(mod.MAX_PRIVATE_IMAGE_BYTES,8*1024*1024);
  const png=new Uint8Array(24);
  png.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a],0);
  png.set([0x49,0x48,0x44,0x52],12);
  new DataView(png.buffer).setUint32(16,640,false);
  new DataView(png.buffer).setUint32(20,480,false);
  assert.equal(mod.detectImageMime(png),"image/png");
  assert.deepEqual(mod.imageDimensions(png),{width:640,height:480});

  const jpeg=new Uint8Array(24);
  jpeg.set([0xff,0xd8,0xff,0xc0,0x00,0x11,0x08,0x00,0x64,0x00,0xc8],0);
  assert.equal(mod.detectImageMime(jpeg),"image/jpeg");
  assert.deepEqual(mod.imageDimensions(jpeg),{width:200,height:100});

  const webp=new Uint8Array(30);
  webp.set(new TextEncoder().encode("RIFF"),0);webp.set(new TextEncoder().encode("WEBP"),8);webp.set(new TextEncoder().encode("VP8X"),12);
  webp[24]=0xff;webp[25]=0x01;webp[27]=0xff;webp[28]=0x00;
  assert.equal(mod.detectImageMime(webp),"image/webp");
  assert.deepEqual(mod.imageDimensions(webp),{width:512,height:256});
  assert.equal(mod.detectImageMime(new TextEncoder().encode("<svg></svg>")),null);
  assert.throws(()=>mod.validateImageDimensions({width:10000,height:10000}),/safe limits/);
  assert.match(privateMedia,/metadata: "none"/);
  assert.match(privateMedia,/format: "image\/webp"/);
  assert.match(privateMedia,/quarantine\//);
  assert.match(privateMedia,/safe\//);
});

test("private image pipeline awaits async Images output before response and stores safe output",async()=>{
  const mod=await importTs("lib/private-media.ts");
  const png=new Uint8Array(24);
  png.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a],0);
  png.set([0x49,0x48,0x44,0x52],12);
  new DataView(png.buffer).setUint32(16,640,false);
  new DataView(png.buffer).setUint32(20,480,false);

  const events=[];
  const puts=[];
  const deletes=[];
  const privateBucket={
    async put(key,value,options){puts.push({key,value,options});},
    async get(){return null;},
    async delete(key){deletes.push(key);},
  };
  const images={
    input(){
      return {
        transform(){
          return {
            output:async()=>{
              events.push("output:start");
              await Promise.resolve();
              events.push("output:resolved");
              return {
                response(){
                  events.push("response");
                  return new Response(new Uint8Array([1,2,3]),{status:200,headers:{"content-type":"image/webp"}});
                },
              };
            },
          };
        },
      };
    },
  };

  const result=await mod.ingestPrivateImage({
    bytes:png,
    declaredMime:"image/png",
    ownerType:"PARTNER_ACCOUNT",
    ownerId:"account-1",
    assetId:"asset-1",
    privateBucket,
    images,
  });

  assert.deepEqual(events,["output:start","output:resolved","response"]);
  assert.equal(deletes.length,0);
  assert.equal(puts.length,2);
  assert.match(puts[0].key,/^quarantine\/PARTNER_ACCOUNT\/account-1\/asset-1-/);
  assert.equal(puts[1].key,"safe/PARTNER_ACCOUNT/account-1/asset-1.webp");
  assert.equal(result.safeMime,"image/webp");
  assert.equal(result.safeSizeBytes,3);
  assert.match(privateMedia,/output\(options: Record<string, unknown>\): Promise<ImageTransformationResultLike>/);
  assert.match(privateMedia,/const transformed = await input\.images\.input\(source\)/);
});

test("Partner upload endpoint is separately authorized, same-origin, rate-limited and never accepts arbitrary object keys",()=>{
  assert.match(upload,/requirePartnerAccount/);
  assert.match(upload,/assertPartnerMutationOrigin/);
  assert.match(upload,/enforcePartnerMediaUploadRateLimit/);
  assert.match(upload,/x-media-intent/);
  assert.match(upload,/image\/jpeg/);assert.match(upload,/image\/png/);assert.match(upload,/image\/webp/);
  assert.doesNotMatch(upload,/image\/svg|x-object-key|imageKey|public_key/);
  assert.match(security,/partner-media-upload/);
  assert.match(partnerMedia,/crypto\.randomUUID/);
  assert.match(partnerMedia,/owner_id=\?1/);
});

test("staged media is private to its owner/admin and public media route rejects quarantine/safe namespaces",()=>{
  assert.match(partnerPreview,/requirePartnerAccount/);
  assert.match(partnerPreview,/readPartnerMediaPreview/);
  assert.match(partnerPreview,/accountId:identity\.accountId/);
  assert.match(adminPreview,/getAdminApiUser/);
  assert.match(publicMedia,/segments\[0\] === "quarantine"/);
  assert.match(publicMedia,/segments\[0\] === "safe"/);
  assert.match(publicMedia,/status: 404/);
});

test("submission creation binds media through moderation and withdraw invalidates attached media without canonical writes",()=>{
  for(const domain of [newProfile,profileChanges,events]){
    assert.match(domain,/media_asset_id/);
    assert.match(domain,/normalizePartnerMediaId/);
    assert.match(domain,/terminalPartnerMediaStatement/);
  }
  assert.match(newProfile,/state:"ORPHANED"/);
  assert.match(profileChanges,/state:"ORPHANED"/);
  assert.match(events,/state:"ORPHANED"/);
  const profileSubmit=profileChanges.slice(profileChanges.indexOf("export async function submitPartnerProfileChange"),profileChanges.indexOf("function profileChangeStatusLabel"));
  assert.doesNotMatch(profileSubmit,/UPDATE directory_profiles|UPDATE help_organizations/);
});

test("admin CREATE finalizes staged image only after moderated approval and still creates draft canonical records",()=>{
  assert.match(newProfileAdmin,/publishPartnerSubmissionMedia/);
  assert.match(newProfileAdmin,/imageUrl:media\?\.imageUrl\?\?null/);
  assert.match(newProfileAdmin,/state:"APPROVED"/);
  assert.match(newProfileAdmin,/status:"draft"/);
  assert.match(eventsAdmin,/publishPartnerSubmissionMedia/);
  assert.match(eventsAdmin,/eventInsert\(database,\{id:input\.id,slug,values,actorRef,nowIso,media\}\)/);
  assert.match(eventsAdmin,/state:"APPROVED"/);
  assert.match(eventsAdmin,/'draft'/);
});

test("LINK_EXISTING image overwrite is explicit and defaults off",()=>{
  assert.match(newProfileAdmin,/applyImage\?:boolean/);
  assert.match(newProfileAdmin,/input\.applyImage===true&&stagedMedia/);
  assert.match(newProfileAdmin,/state:media\?"APPROVED":"ORPHANED"/);
  assert.match(eventsAdmin,/applyImage\?:boolean/);
  assert.match(eventsAdmin,/input\.applyImage===true&&stagedMedia/);
  assert.match(eventsAdmin,/state:media\?"APPROVED":"ORPHANED"/);
});

test("profile/event UPDATE image finalization participates in H5 CAS and rejection leaves canonical unchanged",()=>{
  assert.match(profileChangesAdmin,/transitionGuard/);
  assert.match(profileChangesAdmin,/updated_at=\?/);
  assert.match(profileChangesAdmin,/imageApplyStatement/);
  assert.match(profileChangesAdmin,/terminalPartnerMediaStatement\(\{database,submissionId:input\.id,state:"APPROVED"/);
  assert.match(profileChangesAdmin,/state:"REJECTED"/);
  assert.match(eventsAdmin,/transitionGuard:\{sql:"EXISTS\(SELECT 1 FROM managed_events WHERE id=\? AND updated_at=\?\)"/);
  assert.match(eventsAdmin,/eventImageUpdateStatement/);
  assert.match(eventsAdmin,/state:"REJECTED"/);
  assert.match(eventsAdmin,/ModerationStateConflictError/);
});

test("cleanup is idempotent and excludes ATTACHED/APPROVED media",()=>{
  assert.match(partnerMedia,/state='PENDING' AND created_at<\?1/);
  assert.match(partnerMedia,/state IN \('REJECTED','ORPHANED'\)/);
  assert.match(partnerMedia,/state IN \('PENDING','REJECTED','ORPHANED'\)/);
  assert.doesNotMatch(partnerMedia,/state IN \([^\n]*APPROVED/);
  assert.match(worker,/cleanupPartnerMedia/);
  assert.match(worker,/partner_media_cleanup/);
});

test("Partner and admin UI expose preview replace remove, current-vs-proposed and mobile-safe controls",()=>{
  assert.match(mediaField,/type="file"/);
  assert.match(mediaField,/accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(mediaField,/Nahradiť obrázok/);
  assert.match(mediaField,/Odstrániť/);
  assert.match(mediaField,/aria-live="polite"/);
  assert.match(newProfileForm,/Logo alebo hlavná fotografia/);
  assert.match(profileEditForm,/Navrhnúť zmenu obrázka/);
  assert.match(eventForm,/Hlavný obrázok podujatia/);
  assert.match(partnerCss,/@media\(max-width:600px\)/);
  assert.match(partnerCss,/width:100%/);
  assert.match(adminCss,/admin-partner-media-compare/);
  assert.match(adminCss,/@media\(max-width:720px\)/);
});
