#!/usr/bin/env node
// Guarded, owner-dispatched Partner 0171/0172 rollout. No generic migration replay.
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
const mode=process.argv[2]||"";
const database="psipedia-sk-db", dbid="8f7a0c3e-4d77-4a35-8192-a7bd57147950", account="5ff902d3d80376478b9213b2b8ae8d6e";
const out=resolve(".production-d1-partner-0171-0172"),config=resolve(out,"wrangler.json");
const files={
  "0171":{name:"0171_partner_single_manager.sql",blob:"99054ef49fcc2935b26c517251a1fe4a5a0baa97"},
  "0172":{name:"0172_partner_help_claim_ownership.sql",blob:"0be2dc902fdf6164f3aad1389fc24d94335ab685"}
};
const baselineTables=["partner_accounts","partner_resources","partner_memberships","partner_audit_events","partner_notification_outbox","moderation_submissions","moderation_events","adoption_dogs","lost_found_dog_reports","help_cases"];
const directoryTables=["directory_profile_filter_values","directory_profile_public_facts","directory_profile_additional_categories"];
const objects171={partner_memberships_one_active_resource:"index",partner_memberships_only_owner_insert:"trigger",partner_memberships_only_owner_update:"trigger"};
const objects172={partner_help_claims:"table",partner_help_claims_account_history:"index",partner_help_claims_status_created:"index",partner_help_claims_adoption_manager:"index",partner_help_claims_report_manager:"index",partner_help_claims_case_manager:"index",partner_help_claims_adoption_pending:"index",partner_help_claims_report_pending:"index",partner_help_claims_case_pending:"index"};
const fail=(ok,code)=>{if(!ok)throw Error("PARTNER_D1_"+code)};
const hash=x=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
let bookmark=null,stage="START",last=null;
function report(phase,state,applied=false,error=null){
  stage=phase;mkdirSync(out,{recursive:true});
  const data={phase,mode,sourceCommit:process.env.GITHUB_SHA,database,applied,
    installed0171:state?.installed171??null,installed0172:state?.installed172??null,
    counts:state?.counts??null,ledgerHash:state?.ledgerHash??null,
    bookmark,migrationLedgerWritten:false,...(error?{error}:{})};
  writeFileSync(resolve(out,"report.json"),JSON.stringify(data,null,2)+"\n");
  // Do not leak the recovery bookmark into the Actions log.
  console.log(JSON.stringify({phase,mode,applied,installed0171:data.installed0171,installed0172:data.installed0172,error}));
}
function authorize(){
  const expected={audit:"AUDIT-psipedia-sk-db","apply-0171":"APPLY-0171-psipedia-sk-db","apply-0172":"APPLY-0172-psipedia-sk-db"}[mode];
  fail(!!expected,"MODE");fail(process.env.GITHUB_EVENT_NAME==="workflow_dispatch","MANUAL_ONLY");
  fail(process.env.GITHUB_REPOSITORY===repoIdentity(),"REPO");
  fail(process.env.GITHUB_REF==="refs/heads/main","MAIN_ONLY");
  fail(!!process.env.GITHUB_SHA && !!process.env.CLOUDFLARE_API_TOKEN,"CREDENTIALS");
  fail(process.env.CLOUDFLARE_ACCOUNT_ID===account,"ACCOUNT");
  fail(process.env.PARTNER_ROLLOUT_CONFIRMATION===expected,"CONFIRMATION");
}
function repoIdentity(){return "investradarsk/psipedia-sk"}
function pinned(key){
  const path=resolve("pending-migrations",files[key].name),bytes=readFileSync(path);
  const blob=createHash("sha1").update(Buffer.concat([Buffer.from("blob "+bytes.length+"\0"),bytes])).digest("hex");
  fail(blob===files[key].blob,"PINNED_"+key+"_CHANGED");return path;
}
function setup(){
  const resources=JSON.parse(readFileSync("config/cloudflare-resources.json","utf8"));
  fail(resources.account_id===account && resources.d1?.database_id===dbid && resources.d1?.database_name===database && resources.d1?.binding==="DB","TARGET");
  mkdirSync(out,{recursive:true});
  writeFileSync(config,JSON.stringify({name:"psipedia-partner-isolated-0171-0172",compatibility_date:"2026-11-19",
    d1_databases:[{binding:"DB",database_name:database,database_id:dbid}]},null,2));
}
function parse(s){
  s=s.trim();try{return JSON.parse(s)}catch{}
  for(const a of [s.indexOf("["),s.indexOf("{")].filter(i=>i>=0))
    for(const b of [s.lastIndexOf("]"),s.lastIndexOf("}")].filter(i=>i>a))
      try{return JSON.parse(s.slice(a,b+1))}catch{}
  throw Error("PARTNER_D1_BAD_JSON");
}
function cli(args){
  const r=spawnSync(process.platform==="win32"?"npx.cmd":"npx",["--no-install","wrangler",...args],{
    encoding:"utf8",maxBuffer:10*1024*1024,env:{...process.env,WRANGLER_SEND_METRICS:"false",NO_UPDATE_NOTIFIER:"1"}});
  fail(!r.error&&r.status===0,"WRANGLER");return r.stdout||"";
}
function select(sql){
  fail(!sql.includes(";") && (/^SELECT\s/i.test(sql)||sql==="PRAGMA foreign_key_check"),"READ_ONLY");
  const x=parse(cli(["d1","execute",database,"--remote","--config",config,"--command",sql,"--json"]));
  const pages=Array.isArray(x)?x:[x];fail(pages.length>0&&pages.every(p=>p.success!==false&&Array.isArray(p.results)),"READ_RESULT");
  return pages.flatMap(p=>p.results);
}
const quoted=values=>values.map(n=>"'"+n+"'").join(",");
function complete(rows,expected,code){
  let count=0;
  for(const [name,type] of Object.entries(expected)){
    const row=rows.find(x=>x.name===name);
    if(row){fail(row.type===type,code+"_TYPE");count++;}
  }
  fail(count===0||count===Object.keys(expected).length,code+"_PARTIAL");
  return count===Object.keys(expected).length;
}
function state(){
  const names=[...baselineTables,...directoryTables,...Object.keys(objects171),...Object.keys(objects172)];
  const rows=select("SELECT type,name,sql FROM sqlite_master WHERE name IN ("+quoted(names)+") ORDER BY name");
  const has=(name,type)=>rows.some(x=>x.name===name&&x.type===type);
  fail(baselineTables.every(x=>has(x,"table")),"BASE_TABLES");
  fail(directoryTables.every(x=>has(x,"table")),"DIRECTORY_TABLES");
  const cols=select("SELECT name FROM pragma_table_info('directory_profiles')").map(x=>x.name);
  fail(["public_phone","public_email","facebook_url","instagram_url"].every(x=>cols.includes(x)),"DIRECTORY_CONTACTS");
  const members=select("SELECT name FROM pragma_table_info('partner_memberships')").map(x=>x.name);
  fail(["id","account_id","resource_id","role","revoked_at"].every(x=>members.includes(x)),"MEMBERSHIP_COLUMNS");
  const history=select("SELECT name FROM d1_migrations ORDER BY id").map(x=>x.name);
  fail(history.every(x=>!/^017[12](?:_|\b)/.test(x)),"UNEXPECTED_LEDGER");
  const fk=select("PRAGMA foreign_key_check");fail(fk.length===0,"FOREIGN_KEYS");
  const c=select("SELECT "+
    "(SELECT COUNT(*) FROM (SELECT resource_id FROM partner_memberships WHERE revoked_at IS NULL GROUP BY resource_id HAVING COUNT(*)>1)) AS duplicates,"+
    "(SELECT COUNT(*) FROM partner_memberships WHERE revoked_at IS NULL AND role<>'OWNER') AS legacy,"+
    "(SELECT COUNT(*) FROM partner_memberships m JOIN partner_accounts a ON a.id=m.account_id WHERE m.revoked_at IS NULL AND a.status<>'ACTIVE') AS inactive,"+
    "(SELECT COUNT(*) FROM partner_memberships) AS memberships,"+
    "(SELECT COUNT(*) FROM partner_accounts) AS accounts,"+
    "(SELECT COUNT(*) FROM partner_audit_events) AS auditEvents")[0];
  fail(!!c,"COUNTS");const counts=Object.fromEntries(Object.entries(c).map(([k,v])=>[k,Number(v)]));
  fail(Object.values(counts).every(Number.isSafeInteger),"COUNTS_INVALID");
  fail(counts.duplicates===0 && counts.legacy===0 && counts.inactive===0,"PARTNER_CONFLICTS");
  const installed171=complete(rows,objects171,"0171"), installed172=complete(rows,objects172,"0172");
  fail(!installed172||installed171,"OUT_OF_ORDER");
  if(installed171){
    const idx=String(rows.find(x=>x.name==="partner_memberships_one_active_resource").sql||"").toUpperCase();
    fail(/CREATE UNIQUE INDEX/.test(idx)&&/REVOKED_AT/.test(idx),"0171_INDEX_DDL");
    for(const name of ["partner_memberships_only_owner_insert","partner_memberships_only_owner_update"]){
      const trg=String(rows.find(x=>x.name===name).sql||"").toUpperCase();
      fail(trg.includes("RAISE(ABORT")&&trg.includes("OWNER")&&trg.includes("NEW.ROLE"),"0171_TRIGGER_DDL");
    }
  }
  if(installed172){
    const table=String(rows.find(x=>x.name==="partner_help_claims").sql||"").toUpperCase();
    fail(["REFERENCES","CHECK","ADOPTION_DOG_ID","LOST_FOUND_REPORT_ID","HELP_CASE_ID"].every(x=>table.includes(x)),"0172_TABLE_DDL");
    for(const name of Object.keys(objects172).filter(x=>x.includes("_manager")||x.includes("_pending"))){
      const idx=String(rows.find(x=>x.name===name).sql||"").toUpperCase();
      fail(idx.includes("UNIQUE INDEX")&&idx.includes("WHERE")&&idx.includes("STATUS"),"0172_INDEX_DDL");
    }
  }
  return {installed171,installed172,counts,ledgerHash:hash(history),
    baseHash:hash(rows.filter(x=>baselineTables.includes(x.name)||directoryTables.includes(x.name))),
    helpRows:installed172?Number(select("SELECT COUNT(*) AS n FROM partner_help_claims")[0]?.n):null};
}
function assertStable(a,b,key){
  fail(a.ledgerHash===b.ledgerHash && a.baseHash===b.baseHash,"SCHEMA_OR_LEDGER_CHANGED");
  for(const k of ["memberships","accounts","auditEvents"])fail(a.counts[k]===b.counts[k],"COUNT_CHANGED_"+k);
  if(key==="0172")fail(a.installed171&&b.installed171,"0171_DISAPPEARED");
}
function recovery(){
  const data=parse(cli(["d1","time-travel","info",database,"--config",config,"--json"]));
  function search(x){if(!x||typeof x!=="object")return null;if(typeof x.bookmark==="string"&&x.bookmark)return x.bookmark;
    for(const v of Object.values(x)){const r=search(v);if(r)return r}return null}
  const b=search(data);fail(!!b,"NO_BOOKMARK");return b;
}
try{
  authorize();const sql={"0171":pinned("0171"),"0172":pinned("0172")};
  setup();last=state();
  if(mode==="audit")report("AUDIT",last);
  else{
    const key=mode.slice(-4);
    fail(key==="0171"?(!last.installed171&&!last.installed172):(last.installed171&&!last.installed172),"ALREADY_OR_OUT_OF_ORDER");
    bookmark=recovery();const fresh=state();assertStable(last,fresh,key);
    fail(key==="0171"?(!fresh.installed171&&!fresh.installed172):(fresh.installed171&&!fresh.installed172),"CONCURRENT_APPLY");
    report("RECOVERY_POINT",fresh);
    // Single reviewed SQL file only. Never call 'd1 migrations apply'.
    cli(["d1","execute",database,"--remote","--config",config,"--file",sql[key],"--yes","--json"]);
    const after=state();assertStable(last,after,key);
    fail(after.installed171&&(key==="0171"?!after.installed172:(after.installed172&&after.helpRows===0)),"POSTFLIGHT");
    report("POSTFLIGHT",after,true);
  }
}catch(e){
  const error=e instanceof Error?e.message:"PARTNER_D1_UNKNOWN";
  console.error(JSON.stringify({phase:"FAILED",stage,error}));
  try{report("FAILED",last,false,error)}catch{}
  process.exitCode=1;
}
