/** Approved 0135 Facebook retry D1 schema: exact checks only, never a D1 writer.
 * Exact SQL fingerprint is intentionally constant, independent of the migration file itself.
 */
export const TARGET_0135 = "0135_facebook_image_safe_retry.sql";
export const PINNED_SHA256_0135 = "20892029e977b4535160a5c518cd0714c216e755d727471afea7f9d344937304";
export const RETRY_0135_COLUMNS = Object.freeze(["retry_count","retry_not_before","outcome_kind"]);
export const OBJECTS_0135 = Object.freeze([
  "facebook_image_publish_retry_idx",
  "facebook_image_publish_attempt_history",
  "facebook_image_publish_attempt_history_post_idx",
  "facebook_image_retry_history_immutable_update",
  "facebook_image_retry_history_immutable_delete",
  "facebook_image_retry_supersede_post_update",
  "facebook_image_retry_audit_reclaim",
]);
const expectedParents = Object.freeze({
  facebook_image_publish_retry_idx:"facebook_image_publish_attempts",
  facebook_image_publish_attempt_history:"facebook_image_publish_attempt_history",
  facebook_image_publish_attempt_history_post_idx:"facebook_image_publish_attempt_history",
  facebook_image_retry_history_immutable_update:"facebook_image_publish_attempt_history",
  facebook_image_retry_history_immutable_delete:"facebook_image_publish_attempt_history",
  facebook_image_retry_supersede_post_update:"facebook_image_posts",
  facebook_image_retry_audit_reclaim:"facebook_image_publish_attempts",
});
const expect = (ok,message) => { if(!ok) throw new Error(message); };
export function normalize0135Ddl(sql) {
  return String(sql??"").replace(/\s+/g," ").trim().replace(/;$/,"").trim().toLowerCase();
}
export function expected0135Objects(source) {
  const cleaned=source.split(/\r?\n/).filter(line=>!/^\s*--/.test(line)).join("\n");
  const positions=[...cleaned.matchAll(/^CREATE\s+(?:TABLE|INDEX|TRIGGER)\s+[a-z][a-z0-9_]*\b/gim)].map(m=>m.index);
  const expected=new Map();
  for(let i=0;i<positions.length;i++) {
    const sql=cleaned.slice(positions[i],positions[i+1]??cleaned.length).trim().replace(/;\s*$/,"").trim();
    const match=/^CREATE\s+(TABLE|INDEX|TRIGGER)\s+([a-z][a-z0-9_]*)\b/i.exec(sql);
    expect(match && !expected.has(match[2]),"0135 invalid duplicate/unknown DDL");
    if(match[1].toUpperCase()==="TRIGGER") expect(/\bEND$/i.test(sql),"0135 incomplete trigger");
    expected.set(match[2],{type:match[1].toLowerCase(),sql:normalize0135Ddl(sql)});
  }
  expect(positions.length===OBJECTS_0135.length && expected.size===OBJECTS_0135.length &&
    OBJECTS_0135.every(name=>expected.has(name)) &&
    [...expected.keys()].every(name=>OBJECTS_0135.includes(name)),"0135 unexpected object inventory");
  return expected;
}
export function assertFacebookRetry0135Schema(schema, sqlSource) {
  expect(typeof sqlSource==="string" && sqlSource.length>0,"0135 expected SQL required");
  const expected=expected0135Objects(sqlSource);
  const columns=schema?.facebookImageAttemptColumns??[];
  for(const [name,type,notnull,defaultValue] of [
    ["retry_count","INTEGER",1,"0"],["retry_not_before","TEXT",0,null],
    ["outcome_kind","TEXT",1,"'UNKNOWN'"]
  ]) {
    const rows=columns.filter(c=>c?.name===name);
    expect(rows.length===1,"0135 missing/duplicate column "+name);
    const c=rows[0];
    expect(String(c.type).toUpperCase()===type && Number(c.notnull)===notnull &&
      Number(c.pk)===0 && (c.dflt_value==null?null:String(c.dflt_value))===defaultValue,
      "0135 altered column drift: "+name);
  }
  const objects=schema?.objects??[];
  const attempts=objects.filter(o=>o?.name==="facebook_image_publish_attempts");
  expect(attempts.length===1 && attempts[0].type==="table","0135 attempt ledger missing");
  const attemptSql=String(attempts[0].sql??"");
  expect(/retry_count\s+INTEGER\s+NOT NULL\s+DEFAULT\s+0\s+CHECK\s*\(retry_count BETWEEN 0 AND 3\)/i.test(attemptSql),"0135 retry bounds lost");
  expect(/outcome_kind\s+TEXT\s+NOT NULL\s+DEFAULT\s+'UNKNOWN'\s+CHECK\s*\(outcome_kind IN \('UNKNOWN','PROVEN_REJECTED','AMBIGUOUS','SUPERSEDED'\)\)/i.test(attemptSql),"0135 outcome guard lost");
  for(const [name,want] of expected){
    const rows=objects.filter(o=>o?.name===name);
    expect(rows.length===1,"0135 missing/duplicated object "+name);
    const row=rows[0];
    expect(row.type===want.type && row.tbl_name===expectedParents[name] &&
      normalize0135Ddl(row.sql)===want.sql,"0135 canonical DDL mismatch: "+name);
  }
  for(const row of objects){
    if(row?.tbl_name==="facebook_image_publish_attempt_history" ||
      (row?.type==="trigger" && ["facebook_image_publish_attempts","facebook_image_posts"].includes(row.tbl_name) &&
        String(row.name).startsWith("facebook_image_retry_")))
      expect(expected.has(String(row.name)),"0135 unexpected related DDL object");
  }
  return true;
}
