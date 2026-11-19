#!/usr/bin/env node
/** Owner-controlled exact-file partner migrations; never generic replay. */
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";

const DB="psipedia-sk-db", ACCOUNT="5ff902d3d80376478b9213b2b8ae8d6e";
const ID="8f7a0c3e-4d77-4a35-8192-a7bd57147950";
const mode=process.argv[2]||"", out=resolve(".production-partner-0171-0172");
const config=resolve(out,"wrangler.json");
const spec={
 apply0171:["0171_partner_single_manager.sql","99054ef49fcc2935b26c517251a1fe4a5a0baa97"],
 apply0172:["0172_partner_help_claim_ownership.sql","0be2dc902fdf6164f3aad1389fc24d94335ab685"],
};
const a=["partner_memberships_one_active_resource","partner_memberships_only_owner_insert","partner_memberships_only_owner_update"];
const b=["partner_help_claims","partner_help_claims_account_history","partner_help_claims_status_created",
 "partner_help_claims_adoption_manager","partner_help_claims_report_manager","partner_help_claims_case_manager",
 "partner_help_claims_adoption_pending","partner_help_claims_report_pending","partner_help_claims_case_pending"];
const tables=["d1_migrations","partner_accounts","partner_resources","partner_memberships",
 "partner_audit_events","partner_notification_outbox","moderation_submissions","moderation_events",
 "adoption_dogs","lost_found_dog_reports","help_cases","directory_profiles",
 "directory_profile_filter_values","directory_profile_additional_categories","directory_profile_public_facts"];
const ok=(cond,code)=>{if(!cond)throw Error("PARTNER_ROLLOUT_"+code)};
let last=null,recovery=false,phase="START";
function auth(){
 ok(["audit","apply0171","apply0172"].includes(mode),"INVALID_MODE");
 ok(process.env.GITHUB_EVENT_NAME==="workflow_dispatch","MANUAL_ONLY");
 ok(process.env.GITHUB_REF==="refs/heads/main","MAIN_ONLY");
 ok(process.env.GITHUB_REPOSITORY==="investradarsk/psipedia-sk","REPOSITORY_MISMATCH");
 ok(process.env.CLOUDFLARE_ACCOUNT_ID===ACCOUNT&&Boolean(process.env.CLOUDFLARE_API_TOKEN),"ACCOUNT_OR_TOKEN");
 const confirmations={audit:"AUDIT-PARTNER-0171-0172-psipedia-sk-db",
  apply0171:"APPLY-0171-psipedia-sk-db",apply0172:"APPLY-0172-psipedia-sk-db"};
 ok(process.env.PARTNER_MIGRATION_CONFIRMATION===confirmations[mode],"CONFIRMATION_MISMATCH");
 if(mode!=="audit")ok(process.env.PARTNER_RECOVERY_CONFIRMATION==="TIME-TRAVEL-BOOKMARK-RECORDED","RECOVERY_CONFIRMATION");
 const cfg=JSON.parse(readFileSync("config/cloudflare-resources.json","utf8"));
 ok(cfg.account_id===ACCOUNT&&cfg.d1?.database_id===ID&&cfg.d1?.database_name===DB&&cfg.d1?.binding==="DB","WRONG_D1");
 for(const [file,sha] of Object.values(spec)){
  const bytes=readFileSync(resolve("drizzle",file));
  const hash=createHash("sha1").update(Buffer.concat([Buffer.from("blob "+bytes.length+"\0"),bytes])).digest("hex");
  ok(hash===sha,"SQL_NOT_PINNED");
 }
 mkdirSync(out,{recursive:true});
 writeFileSync(config,JSON.stringify({name:"psipedia-partner-0171-0172",
  compatibility_date:"2026-11-19",d1_databases:[{binding:"DB",database_name:DB,database_id:ID}]},null,2));
}
function exec(args){
 const p=spawnSync("npx",["--no-install","wrangler",...args],{encoding:"utf8",maxBuffer:12000000,
  env:{...process.env,NO_UPDATE_NOTIFIER:"1",WRANGLER_SEND_METRICS:"false"}});
 ok(!p.error&&p.status===0,"WRANGLER_FAILED");
 return p.stdout||"";
}
function parse(v){
 const s=v.trim();
 try{return JSON.parse(s)}catch{}
 for(const x of [s.indexOf("["),s.indexOf("{")].filter(i=>i>=0))
  for(const y of [s.lastIndexOf("]"),s.lastIndexOf("}")].filter(i=>i>x))
   try{return JSON.parse(s.slice(x,y+1))}catch{}
 throw Error("PARTNER_ROLLOUT_INVALID_JSON");
}
function read(q){
 ok(/^\s*SELECT\b/i.test(q)&&!q.includes(";")&&!/\b(?:UPDATE|DELETE|INSERT|ALTER|CREATE|DROP|REPLACE)\b/i.test(q),"READ_ONLY");
 const v=parse(exec(["d1","execute",DB,"--remote","--config",config,"--command",q,"--json"]));
 const pages=Array.isArray(v)?v:[v];
 ok(pages.every(x=>x?.success===true&&Array.isArray(x.results)),"INVALID_REMOTE_RESULT");
 return pages.flatMap(x=>x.results);
}
function count(q){
 const n=Number(read(q)[0]?.n);
 ok(Number.isSafeInteger(n)&&n>=0,"INVALID_COUNT");
 return n;
}
function schemaStatus(arr,map){
 const found=arr.filter(x=>map.has(x));
 return found.length===0?"absent":found.length===arr.length?"installed":"partial";
}
function state(){
 const all=[...tables,...a,...b];
 const found=new Map(read("SELECT name,type FROM sqlite_master WHERE name IN ("+
  all.map(x=>"'"+x+"'").join(",")+")").map(x=>[x.name,x.type]));
 ok(tables.every(x=>found.get(x)==="table"),"MISSING_BASE_TABLES");
 const cols=new Set(read("SELECT name FROM pragma_table_info('directory_profiles')").map(x=>x.name));
 ok(["public_phone","public_email","facebook_url","instagram_url"].every(x=>cols.has(x)),"MISSING_0170_CONTACTS");
 const one=schemaStatus(a,found),two=schemaStatus(b,found);
 ok(one!=="partial"&&two!=="partial","PARTIAL_SCHEMA_STOP");
 ok(two!=="installed"||one==="installed","0172_REQUIRES_0171");
 ok(a.every(x=>!found.has(x)||found.get(x)===(x===a[0]?"index":"trigger")),"INVALID_0171_TYPE");
 ok(b.every(x=>!found.has(x)||found.get(x)===(x===b[0]?"table":"index")),"INVALID_0172_TYPE");
 const history=read("SELECT name FROM d1_migrations WHERE name LIKE '0171_%' OR name LIKE '0172_%'");
 ok(history.length===0,"LEDGER_ALREADY_REFERENCES_MIGRATION");
 const duplicate=count("SELECT COUNT(*) AS n FROM (SELECT resource_id FROM partner_memberships WHERE revoked_at IS NULL GROUP BY resource_id HAVING COUNT(*)>1)");
 const legacy=count("SELECT COUNT(*) AS n FROM partner_memberships WHERE revoked_at IS NULL AND role<>'OWNER'");
 const inactive=count("SELECT COUNT(*) AS n FROM partner_memberships m JOIN partner_accounts p ON p.id=m.account_id WHERE m.revoked_at IS NULL AND p.status<>'ACTIVE'");
 const fk=count("SELECT COUNT(*) AS n FROM pragma_foreign_key_check");
 ok(duplicate===0&&legacy===0&&inactive===0&&fk===0,"PREFLIGHT_CONFLICT_STOP");
 const groups=["partner_memberships","partner_audit_events","partner_accounts","partner_resources",
  "adoption_dogs","lost_found_dog_reports","help_cases"];
 const counts=Object.fromEntries(groups.map(x=>[x,count("SELECT COUNT(*) AS n FROM "+x)]));
 const claims=two==="installed"?count("SELECT COUNT(*) AS n FROM partner_help_claims"):null;
 return {one,two,duplicate,legacy,inactive,fk,counts,claims};
}
function signature(s){return createHash("sha256").update(JSON.stringify(s)).digest("hex")}
function checkpoint(){
 const parsed=parse(exec(["d1","time-travel","info",DB,"--config",config,"--json"]));
 function seek(x){
  if(!x||typeof x!=="object")return false;
  if(typeof x.bookmark==="string"&&x.bookmark)return true;
  return Object.values(x).some(seek);
 }
 ok(seek(parsed),"NO_RECOVERY_BOOKMARK");
 recovery=true;
}
function report(status,s,error=null){
 phase=status;mkdirSync(out,{recursive:true});
 const data={status,mode,commit:process.env.GITHUB_SHA,
  schema171:s?.one??null,schema172:s?.two??null,
  duplicateManagers:s?.duplicate??null,legacyRoles:s?.legacy??null,
  inactiveAccounts:s?.inactive??null,foreignKeyViolations:s?.fk??null,
  counts:s?.counts??null,claims:s?.claims??null,
  recoveryBookmarkCaptured:recovery,ledgerChanged:false,...(error?{error}:{})};
 writeFileSync(resolve(out,"report.json"),JSON.stringify(data,null,2)+"\n");
 console.log(JSON.stringify({status,mode,schema171:data.schema171,schema172:data.schema172,error}));
}
function run(){
 auth();last=state();
 if(mode==="audit"){report("AUDIT",last);return}
 const key=mode==="apply0171"?"one":"two";
 if(last[key]==="installed"){report("ALREADY_INSTALLED",last);return}
 ok(last[key]==="absent","PARTIAL_TARGET");
 if(mode==="apply0172")ok(last.one==="installed","0171_REQUIRED_FIRST");
 checkpoint();
 const fresh=state();
 ok(signature(fresh)===signature(last),"STATE_CHANGED_BEFORE_APPLY");
 report("RECOVERY_POINT",fresh);
 exec(["d1","execute",DB,"--remote","--config",config,"--file",
  resolve("drizzle",spec[mode][0]),"--yes","--json"]);
 const after=state();
 ok(after[key]==="installed"&&after.one==="installed","POSTFLIGHT_SCHEMA_INCOMPLETE");
 ok(Object.keys(last.counts).every(k=>after.counts[k]===last.counts[k]),"POSTFLIGHT_BASE_COUNT_CHANGED");
 if(mode==="apply0172")ok(after.claims===0,"NEW_HELP_CLAIMS_NOT_EMPTY");
 report("POSTFLIGHT",after);
}
try{run()}catch(e){
 const error=e instanceof Error?e.message:"UNKNOWN";
 console.error(JSON.stringify({phase,error}));
 try{report("FAILED",last,error)}catch{}
 process.exitCode=1;
}
