import {createHash} from "node:crypto";

/** Owner-dispatch only. Immutable additive Services V3 auto attempt journal. */
export const PINNED_SHA256_0139="dbc5663f6ade372ac6e7b780f24323de0013240b20bf486a6c439e6b90c90038";
export const OBJECTS_0139=Object.freeze({
  service_catalog_notion_auto_attempts:"table",
  service_catalog_notion_auto_attempts_claimed_idx:"index",
  service_catalog_notion_auto_attempt_update_guard:"trigger",
  service_catalog_notion_auto_attempt_no_delete:"trigger"
});
const table="service_catalog_notion_auto_attempts";
const normalize=s=>String(s??"").replace(/\s+/g," ").trim().toLowerCase();
function uniqueObject(objects,name,type){
  const rows=objects.filter(o=>o.name===name);
  if(rows.length!==1||rows[0].type!==type)throw Error("0139_MISSING_OR_WRONG_OBJECT:"+name);
  return rows[0];
}
export function assertServicesV3Auto0139Prerequisites(schema){
  const objects=schema?.objects??[];
  for(const name of ["service_catalog_admin_options","service_catalog_admin_notion_receipts","article_notion_editorial_outbox"]){
    uniqueObject(objects,name,"table");
  }
  // No 0139 before the 0134 receipt guard and 0138 outbox are present.
  uniqueObject(objects,"service_catalog_admin_receipt_no_delete","trigger");
  return true;
}
export function assertServicesV3Auto0139Schema(schema,source){
  if(createHash("sha256").update(source).digest("hex")!==PINNED_SHA256_0139)
    throw Error("0139_IMMUTABLE_SQL_HASH_MISMATCH");
  assertServicesV3Auto0139Prerequisites(schema);
  const objects=schema?.objects??[];
  for(const [name,type] of Object.entries(OBJECTS_0139))uniqueObject(objects,name,type);
  const names=new Set(Object.keys(OBJECTS_0139));
  if(objects.some(o=>o.tbl_name===table&&!names.has(o.name)&&!o.name.startsWith("sqlite_autoindex_")))
    throw Error("0139_UNKNOWN_OBJECT_ON_JOURNAL");
  const sql=normalize(uniqueObject(objects,table,"table").sql);
  for(const contract of [
    "option_id text not null",
    "option_version integer not null check(option_version>=1)",
    "action text not null check(action in ('provision_one','mirror_one'))",
    "primary key (option_id,option_version,action)",
    "check((outcome='claimed' and finished_at is null)",
    "or (outcome<>'claimed' and finished_at is not null)"
  ])if(!sql.includes(normalize(contract)))throw Error("0139_TABLE_CONTRACT_DRIFT:"+contract);
  const idx=uniqueObject(objects,"service_catalog_notion_auto_attempts_claimed_idx","index");
  if(idx.tbl_name!==table||!normalize(idx.sql).includes("on service_catalog_notion_auto_attempts(claimed_at)"))
    throw Error("0139_INDEX_CONTRACT_DRIFT");
  const update=normalize(uniqueObject(objects,"service_catalog_notion_auto_attempt_update_guard","trigger").sql);
  for(const contract of ["before update on service_catalog_notion_auto_attempts",
    "old.outcome<>'claimed'", "new.option_id<>old.option_id",
    "new.option_version<>old.option_version","new.action<>old.action",
    "new.claimed_at<>old.claimed_at","new.outcome='claimed'","new.finished_at is null",
    "raise(abort,'services v3 auto attempt cannot be rewritten')"])
    if(!update.includes(normalize(contract)))throw Error("0139_UPDATE_GUARD_DRIFT");
  const del=normalize(uniqueObject(objects,"service_catalog_notion_auto_attempt_no_delete","trigger").sql);
  for(const contract of ["before delete on service_catalog_notion_auto_attempts",
    "raise(abort,'services v3 auto attempt history is durable')"])
    if(!del.includes(normalize(contract)))throw Error("0139_DELETE_GUARD_DRIFT");
  return true;
}
