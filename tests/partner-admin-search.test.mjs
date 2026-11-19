import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {DatabaseSync} from "node:sqlite";
import {pathToFileURL} from "node:url";

const root=new URL("../",import.meta.url);
const importTs=path=>import(pathToFileURL(new URL(path,root).pathname).href);
const {listPartnerAccountsAdmin,normalizePartnerAccountAdminFilters}=await importTs("lib/partner-admin-store.ts");
const {encryptPii}=await importTs("lib/pii-crypto.ts");
const {createAdminPartnerResourceSearch}=await importTs("lib/partner-admin-resource-search.ts");
const key=Buffer.alloc(32,17).toString("base64url");

function fakeD1(sqlite){
  return {prepare(sql){
    const statement=sqlite.prepare(sql);
    return {bind(...params){
      return {
        async first(){return statement.get(...params)??null;},
        async all(){return {results:statement.all(...params)};},
      };
    }};
  }};
}
let database,sql;
async function setup(){
  sql=new DatabaseSync(":memory:");
  sql.exec(`
    CREATE TABLE partner_accounts(id TEXT PRIMARY KEY,email_ciphertext TEXT NOT NULL,status TEXT NOT NULL,email_verified_at TEXT,created_at TEXT NOT NULL);
    CREATE TABLE partner_account_profiles(account_id TEXT PRIMARY KEY,contact_name_ciphertext TEXT NOT NULL);
    CREATE TABLE partner_memberships(id TEXT PRIMARY KEY,account_id TEXT NOT NULL,revoked_at TEXT);
    CREATE TABLE partner_claims(account_id TEXT NOT NULL,status TEXT NOT NULL);
    CREATE TABLE partner_help_claims(account_id TEXT NOT NULL,status TEXT NOT NULL);
    CREATE TABLE moderation_submissions(id TEXT PRIMARY KEY,submitter_type TEXT,submitter_ref TEXT,operation TEXT,resource_type TEXT,status TEXT NOT NULL);
    CREATE TABLE partner_new_profile_metadata(submission_id TEXT,partner_account_id TEXT NOT NULL);
    CREATE TABLE partner_profile_change_metadata(submission_id TEXT,partner_account_id TEXT NOT NULL);
    CREATE TABLE partner_event_submission_metadata(submission_id TEXT,partner_account_id TEXT NOT NULL);
    CREATE TABLE partner_resource_verifications(account_id TEXT NOT NULL,status TEXT NOT NULL);
    CREATE TABLE partner_commercial_interests(account_id TEXT NOT NULL,status TEXT NOT NULL);
  `);
  const insert=sql.prepare("INSERT INTO partner_accounts VALUES (?,?,?,?,?)");
  const member=sql.prepare("INSERT INTO partner_memberships VALUES (?,?,?)");
  for(let i=0;i<325;i++){
    const id="partner-"+String(i).padStart(4,"0");
    const email=await encryptPii("old-index-"+String(i).padStart(4,"0")+"@example.sk",key);
    // Same timestamp every five rows exercises the deterministic id tie-break.
    const createdAt=new Date(Date.UTC(2026,9,1)+Math.floor(i/5)*60_000).toISOString();
    insert.run(id,email,i%2===0?"ACTIVE":"SUSPENDED",i%3===0?null:createdAt,createdAt);
  }
  member.run("active-a","partner-0007",null);
  member.run("active-b","partner-0007",null);
  member.run("revoked","partner-0007","2026-10-02T00:00:00Z");
  sql.prepare("INSERT INTO partner_account_profiles VALUES (?,?)")
    .run("partner-0007",await encryptPii("Chovateľská stanica Neo",key));
  database=fakeD1(sql);
}
test("searches all 325 encrypted accounts, including beyond the former 250 cap",async()=>{
  await setup();
  try{
    const result=await listPartnerAccountsAdmin({q:"old-index-0007",database,encryptionKey:key});
    assert.equal(result.total,1);
    assert.equal(result.items[0].id,"partner-0007");
    assert.equal(result.items[0].email,"old-index-0007@example.sk");
    assert.equal(result.items[0].activeMembershipCount,2);
    assert.equal(result.items[0].contactName,"Chovateľská stanica Neo");
    assert.equal(result.items[0].managedProfileCount,2);
    assert.equal(result.items[0].pendingRequestCount,0);
    const byName=await listPartnerAccountsAdmin({q:"chovateľská stanica neo",database,encryptionKey:key});
    assert.equal(byName.total,1);
    assert.equal(byName.items[0].id,"partner-0007");
    const byId=await listPartnerAccountsAdmin({q:"partner-0007",database,encryptionKey:key});
    assert.equal(byId.total,1);
    const literal=await listPartnerAccountsAdmin({q:"%",database,encryptionKey:key});
    assert.equal(literal.total,0,"percent is not a SQL wildcard for encrypted search");
  }finally{sql.close();}
});
test("server page, status/verification filters and stable order work without search",async()=>{
  await setup();
  try{
    const page1=await listPartnerAccountsAdmin({page:1,pageSize:25,database,encryptionKey:key});
    const page2=await listPartnerAccountsAdmin({page:2,pageSize:25,database,encryptionKey:key});
    assert.equal(page1.total,325);
    assert.equal(page1.items.length,25);
    assert.equal(page2.items.length,25);
    assert.equal(page1.totalPages,13);
    assert.equal(new Set([...page1.items,...page2.items].map(x=>x.id)).size,50);
    assert.deepEqual(page1.items.map(x=>x.id),[...page1.items].map(x=>x.id).sort((a,b)=>b.localeCompare(a)));
    const filtered=await listPartnerAccountsAdmin({status:"ACTIVE",verified:"UNVERIFIED",pageSize:10,page:2,database,encryptionKey:key});
    assert.equal(filtered.total,55);
    assert.equal(filtered.items.length,10);
    assert.ok(filtered.items.every(x=>x.status==="ACTIVE"&&!x.emailVerifiedAt));
    const searched=await listPartnerAccountsAdmin({q:"@example.sk",status:"SUSPENDED",verified:"VERIFIED",page:2,pageSize:50,database,encryptionKey:key});
    assert.equal(searched.total,108);
    assert.equal(searched.items.length,50);
    assert.ok(searched.items.every(x=>x.status==="SUSPENDED"&&x.emailVerifiedAt));
    const linked=await listPartnerAccountsAdmin({access:"LINKED",database,encryptionKey:key});
    const unlinked=await listPartnerAccountsAdmin({access:"UNLINKED",database,encryptionKey:key});
    assert.equal(linked.total,1);
    assert.equal(linked.items[0].id,"partner-0007");
    assert.equal(unlinked.total,324);
    assert.equal(unlinked.items.some(item=>item.id==="partner-0007"),false);
    const linkedSuspended=await listPartnerAccountsAdmin({status:"SUSPENDED",access:"LINKED",database,encryptionKey:key});
    assert.equal(linkedSuspended.total,1);
    assert.equal(normalizePartnerAccountAdminFilters({access:"INVALID"}).access,"");
    assert.deepEqual(normalizePartnerAccountAdminFilters({page:-5,pageSize:10000,status:"INJECT"}),{q:"",page:1,pageSize:100,status:"",verified:"",access:""});
  }finally{sql.close();}
});
test("partner overview counts pending requests from all current sources and approved Help management", async () => {
  await setup();
  try {
    sql.exec(`
      INSERT INTO partner_claims VALUES ('partner-0007','PENDING'),('partner-0007','APPROVED');
      INSERT INTO partner_help_claims VALUES ('partner-0007','PENDING'),('partner-0007','APPROVED');
      INSERT INTO moderation_submissions VALUES
        ('new-1','PARTNER_ACCOUNT','partner-0007','CREATE','DIRECTORY_PROFILE','SUBMITTED'),
        ('new-old','PARTNER_ACCOUNT','partner-0007','CREATE','DIRECTORY_PROFILE','REJECTED'),
        ('change-1','PARTNER_ACCOUNT','partner-0007','UPDATE','DIRECTORY_PROFILE','PENDING_REVIEW'),
        ('event-1','PARTNER_ACCOUNT','partner-0007','CREATE','MANAGED_EVENT','QUARANTINED'),
        ('help-1','PARTNER_ACCOUNT','partner-0007','CREATE','ADOPTION_DOG','SUBMITTED'),
        ('other-1','PARTNER_ACCOUNT','partner-0008','CREATE','HELP_CASE','SUBMITTED');
      INSERT INTO partner_new_profile_metadata VALUES ('new-1','partner-0007'),('new-old','partner-0007');
      INSERT INTO partner_profile_change_metadata VALUES ('change-1','partner-0007');
      INSERT INTO partner_event_submission_metadata VALUES ('event-1','partner-0007');
      INSERT INTO partner_resource_verifications VALUES ('partner-0007','PENDING_VERIFICATION');
      INSERT INTO partner_commercial_interests VALUES ('partner-0007','NEW');
    `);
    const result=await listPartnerAccountsAdmin({q:"partner-0007",database,encryptionKey:key});
    assert.equal(result.items[0].pendingRequestCount,8);
    assert.equal(result.items[0].managedProfileCount,3);
    const other=await listPartnerAccountsAdmin({q:"partner-0008",database,encryptionKey:key});
    assert.equal(other.items[0].pendingRequestCount,1);
    assert.equal(other.items[0].managedProfileCount,0);
    const baseline=await listPartnerAccountsAdmin({q:"partner-0009",database,encryptionKey:key});
    assert.equal(baseline.items[0].pendingRequestCount,0);
    assert.equal(baseline.items[0].managedProfileCount,0);
    const accountHelpOnly="partner-0008";
    sql.prepare("INSERT INTO partner_help_claims VALUES (?,?)").run(accountHelpOnly,"APPROVED");
    const linked=await listPartnerAccountsAdmin({access:"LINKED",database,encryptionKey:key});
    assert.equal(linked.total,2);
    const helpOnly=linked.items.find(item=>item.id===accountHelpOnly);
    assert.equal(helpOnly?.managedProfileCount,1);
  }finally{sql.close();}
});

function collector(fetcher,timeoutMs){
  const state={loading:[],results:[],errors:[]};
  const search=createAdminPartnerResourceSearch({
    onLoading:v=>state.loading.push(v),
    onResults:items=>state.results.push(items),
    onError:message=>state.errors.push(message),
  },{fetcher,timeoutMs});
  return {state,search};
}
function response(items){return {ok:true,status:200,json:async()=>({items})};}
test("lookup resets busy after HTTP rejection, malformed JSON and network failure",async()=>{
  for(const fetcher of [
    async()=>({ok:false,status:500,json:async()=>({})}),
    async()=>({ok:true,status:200,json:async()=>{throw Error("invalid JSON");}}),
    async()=>{throw Error("offline");},
  ]){
    const {state,search}=collector(fetcher,100);
    await search.run("canonical");
    assert.equal(state.loading.at(-1),false);
    assert.equal(state.errors.length,1);
    assert.equal(state.results.length,0);
  }
});
test("aborted user search is inactive and does not show stale errors",async()=>{
  let resolveFetch;
  const fetcher=(_url,{signal})=>new Promise((resolve,reject)=>{
    resolveFetch=resolve;
    signal.addEventListener("abort",()=>reject(new DOMException("Aborted","AbortError")),{once:true});
  });
  const {state,search}=collector(fetcher,1000);
  const waiting=search.run("first");
  search.cancel();
  await waiting;
  resolveFetch?.(response([{id:1}]));
  assert.equal(state.loading.at(-1),false);
  assert.equal(state.results.length,0);
  assert.equal(state.errors.length,0);
});
test("timeout surfaces message and unblocks lookup",async()=>{
  const fetcher=(_url,{signal})=>new Promise((_resolve,reject)=>{
    signal.addEventListener("abort",()=>reject(new DOMException("Timed out","AbortError")),{once:true});
  });
  const {state,search}=collector(fetcher,5);
  await search.run("hung");
  assert.equal(state.loading.at(-1),false);
  assert.match(state.errors[0],/časový limit/);
});
test("latest result wins even if older fetch ignores abort and settles last",async()=>{
  const resolvers=[];
  const fetcher=()=>new Promise(resolve=>resolvers.push(resolve));
  const {state,search}=collector(fetcher,1000);
  const first=search.run("first");
  const second=search.run("second");
  resolvers[1](response([{id:2,name:"new"}]));
  await second;
  resolvers[0](response([{id:1,name:"old"}]));
  await first;
  assert.deepEqual(state.results,[[{id:2,name:"new"}]]);
  assert.equal(state.errors.length,0);
  assert.equal(state.loading.at(-1),false);
});
test("API and UI preserve admin-only access, no-store, abort cleanup and no schema writes",async()=>{
  const api=await fs.readFile(new URL("../app/api/admin/partners/accounts/route.ts",import.meta.url),"utf8");
  const page=await fs.readFile(new URL("../app/admin/partners/page.tsx",import.meta.url),"utf8");
  const client=await fs.readFile(new URL("../components/admin-partner-account-actions.tsx",import.meta.url),"utf8");
  const store=await fs.readFile(new URL("../lib/partner-admin-store.ts",import.meta.url),"utf8");
  assert.match(api,/getAdminApiUser\(\)/);
  assert.match(api,/private, no-store/);
  assert.match(page,/requireAdminPageUser/);
  assert.match(page,/accounts\.items\.map/);
  assert.match(client,/resourceSearch\.cancel\(true\)/);
  assert.match(client,/resourceSearch\.cancel\(\)/);
  assert.match(store,/ORDER BY a\.created_at DESC,a\.id DESC/);
  assert.doesNotMatch(store,/GROUP BY a\.id ORDER BY a\.created_at DESC LIMIT 250/);
});

test("Partneri V2 opens on registered accounts with six useful columns and preserved queues",async()=>{
  const page=await fs.readFile(new URL("../app/admin/partners/page.tsx",import.meta.url),"utf8");
  const css=await fs.readFile(new URL("../app/admin/partners/partners.css",import.meta.url),"utf8");
  const headers=["Partner","E-mail","Žiadosti","Profily","Správy","Akcia"];
  const heading=page.slice(page.indexOf('className="admin-partner-v2-columns"'));
  assert.ok(heading.startsWith('className="admin-partner-v2-columns"'));
  for(const title of headers)assert.ok(heading.includes(">"+title+"</span>"),title);
  assert.ok(page.indexOf("data-admin-partner-accounts")<page.indexOf("data-admin-partner-attention"),
    "Partner accounts must be first; historic review queues are secondary");
  assert.match(page,/a\.pendingRequestCount/);
  assert.match(page,/a\.managedProfileCount/);
  assert.match(page,/a\.contactName/);
  assert.match(page,/Pripravujeme/,"chat unread counts must not be invented");
  assert.match(page,/\/admin\/partners\/accounts\/\$\{a\.id\}/);
  assert.doesNotMatch(page,/className="admin-partner-stats"/,"old eight-stat dashboard removed");
  assert.match(css,/\.admin-partner-table\.admin-partner-v2-table/);
  assert.match(css,/@media \(max-width:760px\)/);
});
