
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const geoSource = source("lib/geo-store.ts");
const mapSource = source("lib/map-query.ts");
const tick = String.fromCharCode(96);
const interpolation = (name) => String.fromCharCode(36,123) + name + "}";
const codeFor = {
  DIRECTORY_PROFILE: source("lib/directory-store.ts"),
  MANAGED_EVENT: source("lib/event-store.ts"),
  ORGANIZATION_LOCATION: source("lib/organization-location-admin-write.ts"),
};
const writerFunctions = {
  DIRECTORY_PROFILE: "updateManagedDirectoryProfileLocationFromGooglePlace",
  MANAGED_EVENT: "updateManagedEventLocationFromGooglePlace",
  ORGANIZATION_LOCATION: "updateOrganizationLocationFromGooglePlace",
};
const tableNames = {
  DIRECTORY_PROFILE: "directory_profiles",
  MANAGED_EVENT: "managed_events",
  ORGANIZATION_LOCATION: "organization_locations",
};
const fkNames = {
  DIRECTORY_PROFILE: "directory_profile_id",
  MANAGED_EVENT: "managed_event_id",
  ORGANIZATION_LOCATION: "organization_location_id",
};
const cas = "updated_at IS ? AND manual_override=? AND public_visibility IS ? AND public_precision IS ? AND source_fingerprint IS ? AND attempt_count=?";
const geoPublic = mapSource.slice(
  mapSource.indexOf("const GEO_PUBLIC_WHERE = ") + "const GEO_PUBLIC_WHERE = ".length + 1,
  mapSource.indexOf(tick, mapSource.indexOf("const GEO_PUBLIC_WHERE = ") + "const GEO_PUBLIC_WHERE = ".length + 1),
);
function extractSQL(content, start, marker, occurrence = 0) {
  const body = content.slice(content.indexOf("export async function " + start));
  let first = -1;
  for (let i = 0; i <= occurrence; i++) first = body.indexOf(marker, first + 1);
  if (first < 0) throw new Error("Missing runtime SQL for " + start + " / " + marker);
  const end = body.indexOf(tick + ").bind(",first);
  if (end < 0) throw new Error("Missing SQL ending for " + start);
  return body.slice(first,end);
}
const visibilitySql = extractSQL(geoSource,"setGeoVisibility","UPDATE geo_points SET",2);
const googleResolutionSql = extractSQL(geoSource,"applyGooglePlaceResolution","UPDATE geo_points SET",1);
const auditSql = extractSQL(geoSource,"resetGoogleMapsNotRequired","INSERT INTO moderation_events");
const invalidationSql = extractSQL(geoSource,"prepareGoogleSourceGeoInvalidation","UPDATE geo_points SET");
const sourceStatements = {
  DIRECTORY_PROFILE: extractSQL(codeFor.DIRECTORY_PROFILE,writerFunctions.DIRECTORY_PROFILE,"UPDATE directory_profiles"),
  MANAGED_EVENT: extractSQL(codeFor.MANAGED_EVENT,writerFunctions.MANAGED_EVENT,"UPDATE managed_events SET city=?"),
  ORGANIZATION_LOCATION: extractSQL(codeFor.ORGANIZATION_LOCATION,writerFunctions.ORGANIZATION_LOCATION,"UPDATE organization_locations"),
};

let db;
let targetType;
let hooks = {};
let clock = 1;
const updateClock = () => "g" + (++clock);
const candidate = (id) => ({
  id, displayName:"Google Example", formattedAddress:"New address " + id,
  latitude:48.5, longitude:18.5,
  address:{locality:"City",region:"Region",district:"District",street:"Main",houseNumber:"22",postalCode:"94901",countryCode:"SK"},
});
export const harness = {
  init(type,{publicExact=true,missingGeo=false,online=false}={}) {
    targetType=type;hooks={};clock=1;
    db=new DatabaseSync(":memory:");
    db.exec("CREATE TABLE directory_profiles(id INTEGER PRIMARY KEY,region TEXT,district TEXT,city TEXT,address TEXT,postal_code TEXT,street TEXT,house_number TEXT,address_format TEXT,service_address_confirmation TEXT,search_text TEXT,updated_at TEXT,updated_by TEXT,status TEXT,archived_at TEXT,website_url TEXT,internal_email TEXT,source_data_json TEXT)");
    db.exec("CREATE TABLE managed_events(id INTEGER PRIMARY KEY,city TEXT,region TEXT,address TEXT,updated_at TEXT,updated_by TEXT,status TEXT,cancelled INTEGER)");
    db.exec("CREATE TABLE organization_locations(id INTEGER PRIMARY KEY,organization_id INTEGER,address TEXT,city TEXT,district TEXT,region TEXT,country_code TEXT)");
    db.exec("CREATE TABLE geo_points(id INTEGER PRIMARY KEY,target_type TEXT,directory_profile_id INTEGER,managed_event_id INTEGER,organization_location_id INTEGER,latitude REAL,longitude REAL,resolution_method TEXT,provider TEXT,provenance TEXT,source_license TEXT,normalized_query TEXT,query_fingerprint TEXT,source_fingerprint TEXT,resolved_source_fingerprint TEXT,google_place_source_fingerprint TEXT,google_place_id TEXT,google_place_matched_at TEXT,updated_at TEXT,attempt_count INTEGER,manual_override INTEGER,public_visibility TEXT,public_precision TEXT,geocode_status TEXT,last_error_code TEXT,last_error_at TEXT,retry_after_at TEXT,last_geocoded_at TEXT)");
    db.exec("CREATE TABLE moderation_events(id TEXT PRIMARY KEY,submission_id TEXT,resource_type TEXT,subject_id TEXT,action TEXT,actor_type TEXT,actor_ref TEXT,from_status TEXT,to_status TEXT,reason_code TEXT,changed_fields_json TEXT,request_id TEXT,created_at TEXT)");
    db.prepare("INSERT INTO directory_profiles(id,region,district,city,address,postal_code,street,house_number,address_format,service_address_confirmation,search_text,updated_at,status,website_url,internal_email,source_data_json) VALUES(1,'Region','District','City','Old address','94901','Main','22','STREET','LEGACY_UNCONFIRMED','old','r0','published','https://example.sk','hello@example.sk','{}')").run();
    db.prepare("INSERT INTO managed_events(id,city,region,address,updated_at,status,cancelled) VALUES(1,?,?, 'Old address','r0','published',0)").run("City", online?"Online":"Region");
    db.prepare("INSERT INTO organization_locations VALUES(1,7,'Old address','City','District','Region','SK')").run();
    if(!missingGeo) {
      const vis = publicExact ? "EXACT_PUBLIC" : "APPROXIMATE_PUBLIC";
      const precision = publicExact ? "EXACT" : "APPROXIMATE";
      db.prepare("INSERT INTO geo_points(id,target_type,directory_profile_id,managed_event_id,organization_location_id,latitude,longitude,source_fingerprint,resolved_source_fingerprint,updated_at,attempt_count,manual_override,public_visibility,public_precision,geocode_status) VALUES(100,?,?,?,?,48.1,18.2,'fp0','fp0','g1',0,0,?,?,'RESOLVED')").run(type,type==="DIRECTORY_PROFILE"?1:null,type==="MANAGED_EVENT"?1:null,type==="ORGANIZATION_LOCATION"?1:null,vis,precision);
    }
    return this;
  },
  inject(name,fn) {hooks[name]=fn;},
  row(table) {return db.prepare("SELECT * FROM "+table+" LIMIT 1").get();},
  decision() {return db.prepare("SELECT id,action FROM moderation_events WHERE resource_type='GEO_POINT' ORDER BY created_at DESC,id DESC LIMIT 1").get() ?? null;},
  publishable() {return db.prepare("SELECT g.id FROM geo_points g WHERE "+geoPublic+" AND g.public_visibility='EXACT_PUBLIC' AND g.public_precision='EXACT'").all();},
  markHidden(){db.prepare("UPDATE geo_points SET public_visibility='HIDDEN',public_precision=NULL,updated_at=? WHERE id=100").run(updateClock());},
  markManual(){db.prepare("UPDATE geo_points SET manual_override=1,updated_at=? WHERE id=100").run(updateClock());},
  markNotRequired(id="other"){db.prepare("INSERT INTO moderation_events(id,resource_type,subject_id,action,created_at) VALUES(?,'GEO_POINT','100','GOOGLE_MAPS_NOT_REQUIRED',?)").run(id,"2026-10-14T18:00:00.000Z");},
  changeCanonical(){db.prepare("UPDATE "+tableNames[targetType]+" SET address='Changed by another admin'"+(targetType!=="ORGANIZATION_LOCATION"?",updated_at='r-other'":"")+" WHERE id=1").run();},
  rawDB() {return db;}
};
async function fire(name){const fn=hooks[name];if(fn){delete hooks[name];await fn();}}
const snapshot=()=>{
  const row=harness.row("geo_points");
  if(!row)return null;
  return {id:row.id,updatedAt:row.updated_at,manualOverride:Boolean(row.manual_override),
    publicVisibility:row.public_visibility,publicPrecision:row.public_precision,
    sourceFingerprint:row.source_fingerprint,attemptCount:row.attempt_count,
    geocodeStatus:row.geocode_status,provider:row.provider,latitude:row.latitude,longitude:row.longitude};
};
const sourceRecord=()=>{
  const table=tableNames[targetType],row=harness.row(table);
  return {targetType,targetId:1,organizationId:7,published:true,label:"Example",
    address:row.address,city:row.city,district:row.district??"District",region:row.region,
    countryCode:row.country_code??"SK",category:"SERVICE",locationRole:"SITE"};
};
export async function getGeoSourceLocation(){return sourceRecord();}
export async function getGeoPointForTarget(){return snapshot();}
export async function hasExplicitPrivateGeoDecision(){return false;}
export async function getGoogleMapsWorkflowSnapshot() {const event=harness.decision();return {eventId:event?.id??null,decision:event?.action==="GOOGLE_MAPS_NOT_REQUIRED"?"NOT_REQUIRED":"UNRESOLVED"};}
export const googlePlaceActionForSource=()=>({available:true});
export const googlePlaceConfirmationForSource=()=>({available:true});
export async function discoverGoogleTargetPlaces(){await fire("discover");return [candidate("place-A"),candidate("place-B")];}
export async function getManagedDirectoryProfileById(){
  const r=harness.row("directory_profiles");
  return {id:1,updatedAt:r.updated_at,address:r.address,region:r.region,district:r.district,city:r.city,
    postalCode:r.postal_code,street:r.street,houseNumber:r.house_number,addressFormat:r.address_format,
    serviceAddressConfirmation:r.service_address_confirmation,name:"Service"};
}
export async function getManagedEventById(){
  const r=harness.row("managed_events");
  return {id:1,updatedAt:r.updated_at,address:r.address,city:r.city,region:r.region};
}
export const adaptAddressGeo=()=>({});
export const adaptDirectoryAddress=(before)=>before;
export const previewGoogleAddressChange=()=>({readyForAuthorization:true,reviewReasons:[]});

async function writeCanonical(type,place,expectedRevision,originalGeoRevision,oldAddr) {
  await fire("beforeBatch");
  const old = harness.row(tableNames[type]);
  const point = snapshot();
  if(originalGeoRevision !== (point?.updatedAt??null))throw new Error("GOOGLE_CONFIRMATION_CONFLICT");
  const key="target_type='"+type+"' AND "+fkNames[type]+"=?";
  const guard=point?"EXISTS (SELECT 1 FROM geo_points WHERE "+key+" AND "+cas+")":"NOT EXISTS (SELECT 1 FROM geo_points WHERE "+key+")";
  const sourceSQL=sourceStatements[type].replace(interpolation("geo.sourceGuard"),guard);
  const srcParams=type==="DIRECTORY_PROFILE"
    ? ["Region","District","City",place.formattedAddress,"94901","Main","22","STREET","search","r1","admin",1,expectedRevision]
    : type==="MANAGED_EVENT"
    ? ["City","Region",place.formattedAddress,"r1","admin",1,expectedRevision]
    : [place.formattedAddress,"City","District","Region","SK",1,7,oldAddr.address,oldAddr.city,oldAddr.district,oldAddr.region,oldAddr.countryCode];
  srcParams.push(1,...(point?[point.updatedAt,0,point.publicVisibility,point.publicPrecision,point.sourceFingerprint,point.attemptCount]:[]));
  const postSQL=type==="ORGANIZATION_LOCATION"
    ? "SELECT 1 FROM organization_locations WHERE id=? AND organization_id=? AND address IS ? AND city IS ? AND district IS ? AND region IS ? AND country_code IS ?"
    : "SELECT 1 FROM "+tableNames[type]+" WHERE id=? AND updated_at=?";
  const postArgs=type==="ORGANIZATION_LOCATION"?[1,7,place.formattedAddress,"City","District","Region","SK"]:[1,"r1"];
  const invalid=point?invalidationSql
    .replace(interpolation("key"),key)
    .replace(interpolation("revision"),cas)
    .replace(/\$\{postCommitSourceCheck \? [^\n]+\}/,"AND EXISTS ("+postSQL+")"):null;
  db.exec("BEGIN");
  let updated=0;
  try {
    updated=type==="ORGANIZATION_LOCATION"?db.prepare(sourceSQL).run(...srcParams).changes:db.prepare(sourceSQL).all(...srcParams).length;
    await fire("duringBatch");
    const invalidated=invalid?db.prepare(invalid).run(updateClock(),1,point.updatedAt,0,point.publicVisibility,point.publicPrecision,point.sourceFingerprint,point.attemptCount,...postArgs).changes:0;
    if(updated===0 || (point && invalidated!==1))throw new Error("GOOGLE_CONFIRMATION_CONFLICT");
    db.exec("COMMIT");
  } catch(error) {db.exec("ROLLBACK");throw error;}
  try {
    await fire("afterBatch");
    if(point) {
      const current=snapshot();
      if(current.updatedAt!=="g2" || current.manualOverride)throw new Error("GOOGLE_CONFIRMATION_CONFLICT");
      db.prepare("UPDATE geo_points SET source_fingerprint=?,updated_at=?,geocode_status='STALE' WHERE id=100 AND updated_at=?").run("fp1",updateClock(),"g2");
    } else {
      db.prepare("INSERT INTO geo_points(id,target_type,directory_profile_id,managed_event_id,organization_location_id,source_fingerprint,updated_at,attempt_count,manual_override,public_visibility,public_precision,geocode_status) VALUES(100,?,?,?,?,?,?,0,0,'APPROXIMATE_PUBLIC','APPROXIMATE','PENDING')").run(type,type==="DIRECTORY_PROFILE"?1:null,type==="MANAGED_EVENT"?1:null,type==="ORGANIZATION_LOCATION"?1:null,"fp1",updateClock());
    }
    await fire("afterReconcile");
  } catch(cause){throw Object.assign(new Error("GOOGLE_SOURCE_COMMITTED_GEO_FAILED",{cause}),{sourceCommitted:true});}
  return {googleConfirmationGeoRevision:snapshot().updatedAt};
}
export async function updateManagedDirectoryProfileLocationFromGooglePlace(id,place,actor,database,rev,geoRev) {
  return { ...await writeCanonical("DIRECTORY_PROFILE",place,rev,geoRev) };
}
export async function updateManagedEventLocationFromGooglePlace(id,place,actor,rev,database,geoRev) {
  return {id:1,...await writeCanonical("MANAGED_EVENT",place,rev,geoRev)};
}
export async function updateOrganizationLocationFromGooglePlace(org,id,place,actor,dbArg,original,geoRev) {
  return {id:1,...await writeCanonical("ORGANIZATION_LOCATION",place,null,geoRev,original)};
}
export async function initializeGeoPointForTarget(){
  if(snapshot())return {created:false,point:snapshot()};
  db.prepare("INSERT INTO geo_points (id,target_type,source_fingerprint,updated_at,attempt_count,manual_override,public_visibility,public_precision,geocode_status) VALUES(100,?,'fp1','g3',0,0,'APPROXIMATE_PUBLIC','APPROXIMATE','PENDING')").run(targetType);
  return {created:true,point:snapshot()};
}
export async function setGeoVisibility(input){
  await fire("beforeVisibility");
  const point=snapshot();
  if(input.expectedGeoRevision!==point.updatedAt)throw new Error("GOOGLE_CONFIRMATION_CONFLICT");
  const now=updateClock();
  const visibility=input.visibility;
  if(visibility!=="EXACT_PUBLIC")throw new Error("Mock only models public exact transition");
  const params=[visibility,"EXACT","query","queryhash","fp1",now,point.id,point.updatedAt,point.manualOverride?1:0,point.publicVisibility,point.publicPrecision,point.sourceFingerprint,point.attemptCount];
  const result=db.prepare(visibilitySql).run(...params);
  if(result.changes!==1)throw new Error("GOOGLE_CONFIRMATION_CONFLICT");
  return snapshot();
}
export async function applyGooglePlaceResolution(input){
  await fire("beforeResolution");
  const p=snapshot();
  if(input.expectedGeoRevision!==p.updatedAt || p.manualOverride)throw new Error("GOOGLE_CONFIRMATION_CONFLICT");
  const now=updateClock();
  const result=db.prepare(googleResolutionSql).run(input.place.latitude,input.place.longitude,input.place.id,now,now,now,p.id,p.sourceFingerprint,p.updatedAt,p.attemptCount);
  if(result.changes!==1)throw new Error("GOOGLE_CONFIRMATION_CONFLICT");
  return snapshot();
}
export async function resetGoogleMapsNotRequired(input) {
  await fire("beforeAudit");
  const p=snapshot();
  const now="2026-10-14T18:01:00.000Z";
  const result=db.prepare(auditSql).run("confirmation-"+updateClock(),String(p.id),input.actorRef,p.geocodeStatus,p.geocodeStatus,
    '["google_maps_workflow"]',now,String(p.id),input.expectedWorkflowRevision,p.id,input.expectedGeoRevision);
  if(result.changes!==1)throw new Error("GOOGLE_CONFIRMATION_CONFLICT");
  return p;
}


export const googleMapsRendererConfigured=()=>false;
export const publicMapLaunchEnabled=()=>false;
export const geoapifyApiKey=()=>null;
export const isGeoPublicPrecision=()=>true;
export const isGeoPublicVisibility=()=>true;
export const isGeoTargetType=(value)=>["DIRECTORY_PROFILE","MANAGED_EVENT","ORGANIZATION_LOCATION"].includes(value);
export const geoFingerprintInput=()=>({});
export const sourceGeoFingerprint=async()=> "fp1";
export const directoryExactGeoCandidate=()=>null;
export const directoryNumberlessPlaceCandidate=()=>null;
export async function getAdminApiUser(){return {email:"editor@example.sk"};}
export const unauthorizedAdminResponse=()=>Response.json({error:"Unauthorized"},{status:401});
export const diagnoseGeoTarget=async()=>({});
export const previewGeoSource=async()=>({});
export const resolveGeoTarget=async()=>({});
export const applyGeocoderResolution=async()=>({});
export const getGoogleMapsWorkflowDecision=async()=> "UNRESOLVED";
export const isGeoSchemaAvailable=async()=>true;
export const resetManualGeoOverride=async()=>({});
export const setGoogleMapsNotRequired=async()=>({});
export const setManualGeoCoordinates=async()=>({});
export const writeGeoModerationEvent=async()=>{};
export const evaluateGooglePlaceCandidates=()=>({});
export const evaluateNumberlessGooglePlaceCandidates=()=>({});
export const googlePlacesApiKey=()=>null;
export const searchGooglePlacesText=async()=>[];
export const autoAssignGooglePlaceForDirectoryProfile=async()=>({});
