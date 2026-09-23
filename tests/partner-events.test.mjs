import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root=new URL("../",import.meta.url);
const read=(path)=>fs.readFile(new URL("../"+path,import.meta.url),"utf8");
const importTs=(path)=>import(pathToFileURL(new URL(path,root).pathname).href);

const [migration,domain,admin,partnerApi,updateApi,withdrawApi,adminApi,attention,attentionStore,partnerAttention,email,platform,eventsPage,requestsPage,newPage,editPage]=await Promise.all([
 "drizzle/0067_partner_events.sql","lib/partner-events.ts","lib/partner-events-admin.ts","app/api/partner/events/route.ts",
 "app/api/partner/events/[id]/changes/route.ts","app/api/partner/events/[id]/withdraw/route.ts","app/api/admin/partners/events/[id]/route.ts",
 "lib/admin-attention-queue.ts","lib/admin-attention-queue-store.ts","lib/partner-attention.ts","lib/partner-email.ts","lib/partner-platform.ts",
 "app/partner/podujatia/page.tsx","app/partner/ziadosti/page.tsx","app/partner/podujatia/nove/page.tsx","app/partner/podujatia/[resourceId]/upravit/page.tsx",
].map(read));

test("0067 is a 1:1 Partner event metadata extension with no parallel workflow status",()=>{
 assert.match(migration,/CREATE TABLE `partner_event_submission_metadata`/);
 assert.match(migration,/`submission_id` text PRIMARY KEY NOT NULL REFERENCES `moderation_submissions`/);
 assert.match(migration,/`operation` text NOT NULL CHECK \(`operation` IN \('CREATE','UPDATE'\)\)/);
 assert.match(migration,/partner_event_submission_active_dedupe_unique/);
 assert.match(migration,/WHERE `dedupe_active`=1/);
 assert.match(migration,/CREATED_NEW/);assert.match(migration,/LINKED_EXISTING/);assert.match(migration,/UPDATED/);
 const ddl=migration.slice(migration.indexOf("CREATE TABLE `partner_event_submission_metadata`"),migration.indexOf(");",migration.indexOf("CREATE TABLE `partner_event_submission_metadata`"))+2);
 assert.doesNotMatch(ddl,/`status`/);
 assert.match(migration,/partner_audit_events_no_update/);assert.match(migration,/partner_audit_events_no_delete/);
});

test("Partner event CREATE uses generic moderation and never writes canonical event before approval",()=>{
 const submit=domain.slice(domain.indexOf("export async function submitPartnerEventCreate"),domain.indexOf("export async function submitPartnerEventUpdate"));
 assert.match(submit,/INSERT INTO moderation_submissions/);
 assert.match(submit,/NULL,'CREATE','SUBMITTED','PARTNER_ACCOUNT'/);
 assert.match(submit,/partner_event_submission_metadata/);
 assert.match(submit,/EVENT_SUBMITTED/);
 assert.doesNotMatch(submit,/INSERT INTO managed_events|UPDATE managed_events/);
});

test("Partner event UPDATE is an explicit patch protected by EVENT_SUBMIT and trusted base",()=>{
 assert.match(domain,/requirePartnerPermission\(accountId,resourceId,"EVENT_SUBMIT"/);
 const update=domain.slice(domain.indexOf("export async function submitPartnerEventUpdate"),domain.indexOf("function statusLabel"));
 assert.match(update,/input\.baseRevision!==editor\.baseRevision/);
 assert.match(update,/normalizePartnerEventUpdate/);
 assert.match(update,/operation,status,submitter_type/);
 assert.match(update,/'UPDATE','SUBMITTED','PARTNER_ACCOUNT'/);
 assert.doesNotMatch(update,/UPDATE managed_events/);
});

test("server field allowlist rejects Partner publication, slug, SEO and media injection",async()=>{
 const {normalizePartnerEventCreate,normalizePartnerEventUpdate}=await importTs("lib/partner-events.ts");
 const base={title:"Psí seminár 2099",excerpt:"Dostatočne dlhý krátky popis podujatia pre návštevníkov.",eventType:"Seminár",startDate:"2099-10-10",startTime:"10:00",endDate:"2099-10-10",endTime:"16:00",venue:"Kynologický areál",city:"Nitra",region:"Nitriansky kraj",address:"Hlavná 1",organizer:"Psipedia test",description:"Toto je dostatočne dlhý opis podujatia, ktorý spĺňa serverovú validáciu a vysvetľuje program.",practicalInfo:"Prineste si vôdzku.",websiteUrl:"https://example.sk",registrationUrl:"https://example.sk/registracia"};
 assert.equal(normalizePartnerEventCreate(base).title,base.title);
 for(const key of ["slug","status","publishedAt","seo","imageUrl","imageKey","createdBy","updatedBy","latitude","longitude","unknown"]){
  assert.throws(()=>normalizePartnerEventCreate({...base,[key]:key==="status"?"published":"x"}),/nie je možné/);
 }
 const current={...normalizePartnerEventCreate(base),cancelled:false};
 assert.throws(()=>normalizePartnerEventUpdate({status:"published"},current),/nie je možné/);
 assert.throws(()=>normalizePartnerEventUpdate({slug:"novy-slug"},current),/nie je možné/);
});

test("Partner self-service rejects an event whose full range is already past",async()=>{
 const {normalizePartnerEventCreate}=await importTs("lib/partner-events.ts");
 assert.throws(()=>normalizePartnerEventCreate({title:"Staré podujatie",excerpt:"Dostatočne dlhý krátky popis starého podujatia.",eventType:"Iné",startDate:"2020-01-01",startTime:"10:00",endDate:"2020-01-02",endTime:"11:00",venue:"Areál",city:"Nitra",region:"Nitriansky kraj",address:"",organizer:"Test",description:"Dostatočne dlhý opis historického podujatia, ktorý prejde ostatnou validáciou.",practicalInfo:"",websiteUrl:"",registrationUrl:""}),/už celé skončilo/);
});

test("deterministic duplicate rules classify registration URL and title/date/city as HIGH",async()=>{
 const {evaluatePartnerEventDuplicateCandidate}=await importTs("lib/partner-events.ts");
 const incoming={title:"Výcvikový deň",eventType:"Tréning",startDate:"2099-11-03",city:"Nitra",region:"Nitriansky kraj",venue:"Areál",organizer:"Klub",registrationUrl:"https://www.example.sk/register"};
 const candidate={id:7,title:"Iné meno",eventType:"Tréning",startDate:"2099-11-03",city:"Bratislava",region:"Bratislavský kraj",venue:"Iné",organizer:"Iný",registrationUrl:"https://example.sk/register/",slug:"event",status:"published"};
 assert.equal(evaluatePartnerEventDuplicateCandidate(incoming,candidate).confidence,"HIGH");
 const titleCandidate={...candidate,id:8,title:"Výcvikový deň",city:"Nitra",registrationUrl:null};
 assert.equal(evaluatePartnerEventDuplicateCandidate(incoming,titleCandidate).confidence,"HIGH");
 const medium={...candidate,id:9,title:"Výcvikový deň",city:"Košice",registrationUrl:null};
 assert.equal(evaluatePartnerEventDuplicateCandidate(incoming,medium).confidence,"MEDIUM");
 const regionMedium={...candidate,id:10,title:"Výcvikový deň",eventType:"Iné",city:"Košice",region:"Nitriansky kraj",registrationUrl:null};
 assert.equal(evaluatePartnerEventDuplicateCandidate(incoming,regionMedium).confidence,"MEDIUM");
 assert.ok(evaluatePartnerEventDuplicateCandidate(incoming,regionMedium).reasons.includes("Rovnaký názov, dátum a kraj"));
 assert.equal(evaluatePartnerEventDuplicateCandidate({...incoming,title:"Úplne iné",registrationUrl:"",venue:"X",organizer:"Y"},{...candidate,registrationUrl:null}),null);
});

test("HIGH duplicate requires explicit Partner confirmation and server rescans",()=>{
 assert.match(domain,/scanPartnerEventDuplicates\(values,db\)/);
 assert.match(domain,/scan\.confidence==="HIGH"&&input\.confirmDuplicate!==true/);
 assert.match(domain,/DUPLICATE_CONFIRMATION_REQUIRED/);
 assert.match(domain,/Rovnaký návrh podujatia už čaká/);
});

test("admin CREATE is atomic and hard-forces canonical draft without publication",()=>{
 const create=admin.slice(admin.indexOf("export async function createPartnerEventAdmin"),admin.indexOf("export async function linkPartnerEventAdmin"));
 const insert=admin.slice(admin.indexOf("function eventInsert"),admin.indexOf("function resourceInsert"));
 assert.match(create,/applyAtomicModerationTransition/);assert.match(create,/toStatus:"APPROVED"/);
 assert.match(create,/eventInsert/);assert.match(create,/resourceInsert/);assert.match(create,/membershipStatements/);
 assert.match(create,/EVENT_CREATED/);assert.match(create,/CREATED_NEW/);
 assert.match(insert,/INSERT INTO managed_events/);assert.match(insert,/'draft'/);assert.match(insert,/NULL,NULL,0,'\{\}'/);
 assert.match(insert,/published_at|published/i); // column exists but value is NULL
 assert.doesNotMatch(insert,/SELECT[^\n]*'published'/i);
});

test("LINK EXISTING creates no canonical event and preserves existing event",()=>{
 const link=admin.slice(admin.indexOf("export async function linkPartnerEventAdmin"),admin.indexOf("const COLUMN"));
 assert.match(link,/currentEvent\(input\.canonicalId/);assert.match(link,/partner_resources/);assert.match(link,/partner_memberships/);
 assert.match(link,/EVENT_LINKED_EXISTING/);assert.match(link,/LINKED_EXISTING/);
 assert.doesNotMatch(link,/INSERT INTO managed_events/);
 assert.doesNotMatch(link,/DELETE FROM partner_memberships|revoked_at=/i);
});

test("UPDATE approval applies only mapped Partner fields and does not touch status or slug",()=>{
 const update=admin.slice(admin.indexOf("export async function approvePartnerEventUpdateAdmin"),admin.indexOf("export const partnerEventRejectionReasons"));
 const columns=admin.slice(admin.indexOf("const COLUMN"),admin.indexOf("function updateStatement"));
 assert.match(update,/normalizePartnerEventUpdate/);assert.match(update,/updateStatement/);assert.match(update,/EVENT_CHANGE_APPROVED/);
 assert.doesNotMatch(columns,/slug|status|published_at|seo|image/i);
 assert.doesNotMatch(update,/notionRequest|runNotionEventSyncSweep|writeBackPublishedEventToNotion|publishManagedEvent|status='published'|slug\s*=/i);
});

test("cancelled remains a moderated update field",()=>{
 assert.match(domain,/UPDATE_KEYS=new Set<string>\(\[\.\.\.CREATE_KEYS,"cancelled"\]\)/);
 assert.match(admin,/cancelled:"cancelled"/);
 assert.match(admin,/key==="cancelled"\?\(patch\[key\]\?1:0\)/);
});

test("Partner mutations require active Partner session and same-origin guard; admin uses internal auth",()=>{
 for(const route of [partnerApi,updateApi,withdrawApi]){assert.match(route,/requirePartnerAccount/);assert.match(route,/assertPartnerJsonMutation/);}
 assert.match(adminApi,/requirePartnerAdminMutation/);assert.doesNotMatch(adminApi,/requirePartnerAccount/);
});

test("withdraw releases dedupe and never changes canonical event",()=>{
 const withdraw=domain.slice(domain.indexOf("export async function withdrawPartnerEventSubmission"));
 assert.match(withdraw,/toStatus:"WITHDRAWN"/);assert.match(withdraw,/dedupe_active=0/);assert.match(withdraw,/EVENT_WITHDRAWN/);
 assert.doesNotMatch(withdraw,/managed_events/);
});

test("Partner event Attention has stable key, direct review deep-link, lifecycle and exact count",()=>{
 assert.match(attention,/PARTNER_EVENT_REVIEW/);assert.match(attention,/partnerAttentionKey\("PARTNER_EVENT_REVIEW",row\.id\)/);
 assert.match(attention,/partnerAttentionHref\("PARTNER_EVENT_REVIEW",row\.id\)/);
 assert.match(attention,/priority:high\?"HIGH":"MEDIUM"/);
 assert.match(partnerAttention,/PARTNER_EVENT_REVIEW:\{key:"partner-event",href:"\/admin\/partners\/events"\}/);
 assert.match(partnerAttention,/eventRow/);assert.match(partnerAttention,/events/);
 assert.match(attentionStore,/partner_event_submission_metadata/);assert.match(attentionStore,/mapPartnerEventAttention/);
 const exact=attentionStore.slice(attentionStore.indexOf("loadExactAdminAttentionSummary"));
 assert.match(exact,/PARTNER_EVENT_REVIEW/);assert.match(exact,/SUBMITTED','PENDING_REVIEW','QUARANTINED/);
});

test("Partner UX exposes dashboard, create, edit, history and withdraw",()=>{
 assert.match(eventsPage,/Pridať podujatie/);assert.match(eventsPage,/pendingChange/);assert.match(eventsPage,/Upraviť/);
 assert.match(newPage,/PartnerEventForm mode="create"/);assert.match(editPage,/PartnerEventForm mode="edit"/);
 assert.match(requestsPage,/Návrhy podujatí/);assert.match(requestsPage,/PartnerEventWithdrawButton/);
});

test("approved published UPDATE uses post-commit GEO and relevant public cache invalidation without Notion publish writeback",()=>{
 assert.match(admin,/syncGeoPointAfterSourceChange\("MANAGED_EVENT",input\.eventId\)/);
 assert.match(admin,/\/podujatia\/kalendar/);
 assert.match(admin,/\/podujatia\/vystavy/);
 assert.match(admin,/\/podujatia\/preteky/);
 assert.match(admin,/\/podujatia\/seminare/);
 assert.match(admin,/input\.published&&input\.invalidatePublic/);
 assert.match(admin,/Partner event GEO sync failed/);
 assert.match(admin,/Partner event public cache invalidation failed/);
 assert.doesNotMatch(admin,/writeBackPublishedEventToNotion|notion-event-sync|publish writeback/i);
});

test("notifications and audit cover the PARTNER-4 lifecycle",()=>{
 for(const type of ["EVENT_SUBMITTED","EVENT_CREATED","EVENT_LINKED_EXISTING","EVENT_CHANGE_APPROVED","EVENT_REJECTED"])assert.match(email,new RegExp(type));
 for(const action of ["EVENT_SUBMITTED","EVENT_CHANGE_SUBMITTED","EVENT_WITHDRAWN","EVENT_CREATED","EVENT_LINKED_EXISTING","EVENT_CHANGE_APPROVED","EVENT_REJECTED"])assert.match(platform,new RegExp(action));
 assert.match(email,/vytvorené ako koncept/i);
});

test("scope excludes Partner media upload, premium entitlement, billing and direct publication",()=>{
 const combined=[domain,admin,partnerApi,updateApi,withdrawApi,adminApi,newPage,editPage].join("\n");
 assert.doesNotMatch(combined,/media_assets|R2Bucket|uploadPartnerImage|stripe|checkout|subscription|billing|premium_entitlement|sponsored_entitlement/i);
 assert.doesNotMatch(domain,/status:"published"|status='published'/i);
 assert.doesNotMatch(partnerApi,/publish/i);
});


test("Partner approval locks inbound Notion sync but does not invoke Notion directly",()=>{
  const update=admin.slice(admin.indexOf("export async function approvePartnerEventUpdateAdmin"),admin.indexOf("export const partnerEventRejectionReasons"));
  assert.match(migration,/ALTER TABLE `event_notion_sync` ADD COLUMN `inbound_locked_at`/);
  assert.match(migration,/PARTNER_MODERATION/);
  assert.match(update,/UPDATE event_notion_sync SET inbound_locked_at=/);
  assert.match(update,/inbound_lock_reason='PARTNER_MODERATION'/);
  assert.doesNotMatch(update,/notionRequest|runNotionEventSyncSweep|writeBackPublishedEventToNotion/);
});
