/** Strict standalone, owner-dispatched 0170 D1 schema gate. No ledger edits/backfill. */
export const FILE_0170="0170_directory_canonical_sql_slots.sql";
export const BLOB_0170="a528e8d8474363639896bb88b8ce65aecfd82065";
export const CONTACTS_0170=["public_phone","public_email","facebook_url","instagram_url"];
export const TABLES_0170=[
 "directory_profile_additional_categories","directory_profile_public_facts",
 "directory_profile_filter_values",
];
export const INDEXES_0170=[
 "directory_profile_additional_categories_category_idx",
 "directory_profile_public_facts_key_idx",
 "directory_profile_filter_values_category_idx",
];
export const DEPENDENCIES_0170=[
 "d1_migrations","directory_profiles","directory_breeder_club_relations",
 "managed_events","help_cases","help_organizations","adoption_dogs",
 "lost_found_dog_reports","managed_eshops",
];
const must=(ok,code)=>{if(!ok)throw Error("DIRECTORY_0170_"+code);};
// ON DELETE CASCADE is schema DDL; forbid executable DELETE FROM and UPDATE ... SET.
const forbidden=/\b(?:DROP|INSERT|REPLACE|VACUUM|ATTACH|DETACH|PRAGMA|TRIGGER)\b|\bDELETE\s+FROM\b|\bUPDATE\s+\w+\s+SET\b/i;
export const norm0170=x=>String(x??"").replace(/["\x60]/g,"").replace(/\s+/g," ")
 .replace(/\s*,\s*/g,",").replace(/\s*\(\s*/g,"(")
 .replace(/\s*\)\s*/g,")").replace(/;\s*$/,"").trim().toUpperCase();
export function statements0170(sql){
 const parts=String(sql??"").split("\n").filter(x=>!x.trimStart().startsWith("--"))
  .join("\n").split(";").map(x=>x.trim()).filter(Boolean);
 must(parts.length===10,"STATEMENT_COUNT");
 const patterns=[
  /^ALTER TABLE directory_profiles ADD COLUMN public_phone TEXT$/i,
  /^ALTER TABLE directory_profiles ADD COLUMN public_email TEXT$/i,
  /^ALTER TABLE directory_profiles ADD COLUMN facebook_url TEXT$/i,
  /^ALTER TABLE directory_profiles ADD COLUMN instagram_url TEXT$/i,
  /^CREATE TABLE directory_profile_additional_categories\s*\(/i,
  /^CREATE INDEX directory_profile_additional_categories_category_idx\s+ON directory_profile_additional_categories\s*\(/i,
  /^CREATE TABLE directory_profile_public_facts\s*\(/i,
  /^CREATE INDEX directory_profile_public_facts_key_idx\s+ON directory_profile_public_facts\s*\(/i,
  /^CREATE TABLE directory_profile_filter_values\s*\(/i,
  /^CREATE INDEX directory_profile_filter_values_category_idx\s+ON directory_profile_filter_values\s*\(/i,
 ];
 parts.forEach((part,i)=>{
  must(patterns[i].test(part),"UNEXPECTED_SQL_"+i);
  must(!forbidden.test(part),"NON_ADDITIVE_SQL_"+i);
 });
 return parts;
}
export function expectedObjects0170(sql){
 const s=statements0170(sql);
 return [
  [TABLES_0170[0],"table",s[4]],[INDEXES_0170[0],"index",s[5]],
  [TABLES_0170[1],"table",s[6]],[INDEXES_0170[1],"index",s[7]],
  [TABLES_0170[2],"table",s[8]],[INDEXES_0170[2],"index",s[9]],
 ].map(([name,type,ddl])=>({name,type,ddl:norm0170(ddl)}));
}
export function inspect0170({sql,objects,history,baseColumns,tableColumns,
 foreignKeys,indexColumns,baseCounts,newCounts}){
 must(Array.isArray(objects)&&Array.isArray(history)&&Array.isArray(baseColumns),
   "BAD_INSPECTION_INPUT");
 must(history.every(x=>typeof x==="string"),"BAD_LEDGER");
 // Production ledger ends at 0162; later schema objects exist without entries.
 must(history.at(-1)==="0162_lost_found_short_description.sql","UNEXPECTED_LEDGER");
 must(!history.includes(FILE_0170),"LEDGER_ALREADY_CONTAINS_0170");
 const byName=new Map(objects.map(x=>[x.name,x]));
 must(byName.size===objects.length,"DUPLICATE_OBJECT");
 for(const name of DEPENDENCIES_0170)
  must(byName.get(name)?.type==="table","MISSING_DEPENDENCY_"+name);
 const expected=expectedObjects0170(sql),baseByName=new Map(baseColumns.map(x=>[x.name,x]));
 const n=CONTACTS_0170.filter(x=>baseByName.has(x)).length+
   expected.filter(x=>byName.has(x.name)).length;
 must(n===0||n===10,"PARTIAL_SCHEMA_STOP");
 must(baseCounts&&typeof baseCounts==="object","BASE_COUNTS_REQUIRED");
 for(const name of DEPENDENCIES_0170.filter(x=>x!=="d1_migrations"))
  must(Number.isSafeInteger(baseCounts[name])&&baseCounts[name]>=0,
    "BAD_COUNT_"+name);
 if(n===0)return {installed:false,readyToApply:true,profiles:baseCounts.directory_profiles};
 for(const name of CONTACTS_0170){
  const c=baseByName.get(name);
  must(c&&String(c.type).toUpperCase()==="TEXT"&&Number(c.notnull)===0&&
    Number(c.pk)===0&&c.dflt_value===null,"BAD_COLUMN_"+name);
 }
 for(const item of expected){
  const obj=byName.get(item.name);
  must(obj.type===item.type&&norm0170(obj.sql)===item.ddl,
    "INCOMPATIBLE_OBJECT_"+item.name);
 }
 const shapes={
  directory_profile_additional_categories:[
   ["profile_id","INTEGER",1,1],["category","TEXT",1,2],
   ["updated_at","TEXT",1,0],["updated_by","TEXT",1,0]],
  directory_profile_public_facts:[
   ["profile_id","INTEGER",1,1],["field_key","TEXT",1,2],
   ["value_text","TEXT",1,0],["updated_at","TEXT",1,0],["updated_by","TEXT",1,0]],
  directory_profile_filter_values:[
   ["profile_id","INTEGER",1,1],["category","TEXT",1,0],
   ["filter_id","TEXT",1,2],["value_text","TEXT",1,0],
   ["updated_at","TEXT",1,0],["updated_by","TEXT",1,0]],
 };
 const indexes={
  directory_profile_additional_categories_category_idx:["category","profile_id"],
  directory_profile_public_facts_key_idx:["field_key","profile_id"],
  directory_profile_filter_values_category_idx:["category","filter_id","value_text","profile_id"],
 };
 for(const table of TABLES_0170){
  const shape=shapes[table],cols=tableColumns?.[table],fks=foreignKeys?.[table];
  must(Array.isArray(cols)&&cols.length===shape.length,"BAD_FIELDS_"+table);
  shape.forEach(([name,type,nn,pk],i)=>{
   const col=cols[i];
   must(col.name===name&&String(col.type).toUpperCase()===type&&
     Number(col.notnull)===nn&&Number(col.pk)===pk,"BAD_FIELD_"+table+"_"+name);
  });
  must(Array.isArray(fks)&&fks.length===1&&fks[0].from==="profile_id"&&
   fks[0].table==="directory_profiles"&&fks[0].to==="id"&&
   String(fks[0].on_delete).toUpperCase()==="CASCADE","BAD_FK_"+table);
  must(Number.isSafeInteger(newCounts?.[table])&&newCounts[table]>=0,
    "BAD_ROWS_"+table);
 }
 for(const [index,columns] of Object.entries(indexes))
  must(JSON.stringify(indexColumns?.[index])===JSON.stringify(columns),
    "BAD_INDEX_"+index);
 return {installed:true,readyToApply:false,profiles:baseCounts.directory_profiles};
}
