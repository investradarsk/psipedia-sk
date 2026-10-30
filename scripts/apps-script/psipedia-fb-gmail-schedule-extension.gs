/**
 * Psipedia Gmail -> Notion FB image bridge: opt-in scheduling EXTENSION.
 *
 * Install into the EXISTING Apps Script, never as another mail poller.
 * The existing bridge owns Gmail polling, deduplication, image upload and
 * initial Notion page creation. This module only hardens draft properties,
 * resolves an existing bridge ID and finalizes a verified uploaded draft.
 * No Facebook, D1, Cloudflare or outbound Gmail operation is performed.
 *
 * Integration:
 * 1) Call psipediaFbFindByGmailId_(message.getId()) BEFORE creating a page.
 * 2) Merge psipediaFbSafeDraftProperties_(existingNoteWithBridgeId) into
 *    initial Notion page properties (overrides BOTH consent checkboxes).
 * 3) Create/resume the existing page and upload/attach the actual image.
 * 4) Only after upload succeeds call
 *    psipediaFbFinalizeSchedule_(message, pageId, {fileId: attachedFileId}).
 *    fileId must come from the confirmed Notion Obrázok.files[].id.
 * 5) Do not mark a partly uploaded email as processed; retry with SAME page.
 */
var PSIPEDIA_FB_DS_ID = "2d945afe-0c79-467e-b9e6-6b0f62a27a49";
var PSIPEDIA_FB_OWNER = "psipedia.sk@gmail.com";
var PSIPEDIA_FB_MARKER = "PSIPEDIA_FB_IMAGE_V1";
var PSIPEDIA_FB_TAG = "\n[FB MAIL SCHEDULE] ";
var PSIPEDIA_FB_TZ = "Europe/Bratislava";

function psipediaFbRich_(s) {
  return {rich_text: s ? [{type:"text",text:{content:String(s).slice(0,1900)}}] : []};
}
function psipediaFbSafeDraftProperties_(note) {
  return {
    "Stav": {status:{name:"Koncept"}},
    "Povoliť publikovanie": {checkbox:false},
    "Súhlas majiteľa – priame publikovanie": {checkbox:false},
    "Dátum a čas publikovania": {date:null},
    "Poznámka": psipediaFbRich_(note)
  };
}
function psipediaFbId_(message) {
  var id=String(message.getId()||"");
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(id)) throw Error("Invalid Gmail message ID");
  return "PSIPEDIA-GMAIL-"+id;
}
function psipediaFbNotion_(method,path,body) {
  var token=PropertiesService.getScriptProperties().getProperty("NOTION_API_TOKEN");
  if (!token) throw Error("NOTION_API_TOKEN missing");
  var opts={method:method,headers:{
    "Authorization":"Bearer "+token, "Notion-Version":"2025-09-03",
    "Content-Type":"application/json"
  },muteHttpExceptions:true};
  if (body!==undefined) opts.payload=JSON.stringify(body);
  var response=UrlFetchApp.fetch("https://api.notion.com/v1"+path,opts);
  var status=response.getResponseCode();
  if (status<200||status>=300) throw Error("Notion HTTP "+status+": "+response.getContentText().slice(0,200));
  return JSON.parse(response.getContentText());
}
/** Existing dedup: query NOTION before CREATE. Duplicates are an error. */
function psipediaFbFindByGmailId_(gmailId) {
  var marker="PSIPEDIA-GMAIL-"+gmailId;
  var r=psipediaFbNotion_("post","/data_sources/"+PSIPEDIA_FB_DS_ID+"/query",{
    page_size:3,filter:{property:"Poznámka",rich_text:{contains:marker}}
  });
  if (r.has_more||(r.results||[]).length>1) throw Error("Duplicate Notion bridge marker "+marker);
  return (r.results||[])[0]||null;
}
function psipediaFbText_(page,field,type) {
  return (((page.properties||{})[field]||{})[type]||[]).map(function(x){
    return x.plain_text||((x.text||{}).content)||"";
  }).join("");
}
function psipediaFbStatus_(page) {
  return (((page.properties||{}).Stav||{}).status||{}).name||"";
}
function psipediaFbDate_(page) {
  return (((page.properties||{})["Dátum a čas publikovania"]||{}).date||{}).start||"";
}
function psipediaFbPlainNote_(page) {
  return psipediaFbText_(page,"Poznámka","rich_text");
}
function psipediaFbNote_(old,message) {
  var base=String(old||"").split(PSIPEDIA_FB_TAG)[0];
  return (base.slice(0,1500)+PSIPEDIA_FB_TAG+String(message).slice(0,290)).slice(0,1900);
}
/** Strict local timestamp and offset, with a DST round-trip via IANA zone. */
function psipediaFbParseBratislavaDate_(value,now) {
  if (typeof value!=="string") return null;
  var m=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})([+-])(\d{2}):(\d{2})$/.exec(value);
  if (!m||Number(m[3])>23||Number(m[4])>59) return null;
  var epoch=Date.parse(value);
  if (!Number.isFinite(epoch)||epoch<=now.getTime()) return null;
  var d=new Date(epoch);
  var local=Utilities.formatDate(d,PSIPEDIA_FB_TZ,"yyyy-MM-dd'T'HH:mm:ss");
  var zone=Utilities.formatDate(d,PSIPEDIA_FB_TZ,"Z");
  if(local!==m[1]||zone!==m[2]+m[3]+m[4]) return null;
  return {date:d,localDay:m[1].slice(0,10),iso:value};
}
function psipediaFbPayload_(message) {
  try {
    var p=JSON.parse(message.getPlainBody());
    if (!p||Array.isArray(p)||typeof p!=="object"||p.marker!==PSIPEDIA_FB_MARKER) return null;
    return p;
  } catch (_) { return null; }
}
function psipediaFbSenderVerified_(message) {
  if (Session.getEffectiveUser().getEmail().toLowerCase()!==PSIPEDIA_FB_OWNER) return false;
  var addresses=String(message.getFrom()).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig)||[];
  if (addresses.length!==1||addresses[0].toLowerCase()!==PSIPEDIA_FB_OWNER) return false;
  // Gmail search returns THREADS, so it cannot prove that this specific
  // message is SENT. Use the authenticated Gmail API to read exact labelIds.
  var url="https://gmail.googleapis.com/gmail/v1/users/me/messages/"+
    encodeURIComponent(message.getId())+"?format=minimal";
  var res=UrlFetchApp.fetch(url,{
    method:"get",headers:{Authorization:"Bearer "+ScriptApp.getOAuthToken()},
    muteHttpExceptions:true
  });
  if(res.getResponseCode()!==200)return false;
  var data=JSON.parse(res.getContentText());
  return data.id===message.getId()&&Array.isArray(data.labelIds)
    &&data.labelIds.indexOf("SENT")>=0;
}
function psipediaFbImage_(message) {
  var attachments=message.getAttachments({includeInlineImages:false,includeAttachments:true});
  var images=[];
  for(var i=0;i<attachments.length;i++){
    var a=attachments[i], bytes=a.getBytes(), mime=String(a.getContentType()).toLowerCase();
    if(mime!=="image/jpeg"&&mime!=="image/png")continue;
    if(!bytes.length||bytes.length>8*1024*1024)continue;
    var png=mime==="image/png"&&bytes.length>8&&
      [137,80,78,71,13,10,26,10].every(function(n,k){return (bytes[k]&255)===n;});
    var jpg=mime==="image/jpeg"&&bytes.length>4&&
      (bytes[0]&255)===255&&(bytes[1]&255)===216&&(bytes[2]&255)===255;
    if(png||jpg)images.push({blob:a,bytes:bytes});
  }
  return images.length===1?images[0]:null;
}
function psipediaFbImageApproved_(image) {
  // This list must come from the existing independent visual brand approval.
  // Neither an attachment, JSON assertion nor owner_approved is logo evidence.
  var allowed=PropertiesService.getScriptProperties()
    .getProperty("PSIPEDIA_FB_APPROVED_IMAGE_SHA256")||"";
  var digest=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,image.bytes);
  var sha=digest.map(function(b){return ("0"+(b&255).toString(16)).slice(-2);}).join("");
  return allowed.split(/[\s,;]+/).some(function(x){return x.toLowerCase()===sha;});
}
function psipediaFbAttachedFileVerified_(page,receipt) {
  if(!receipt||!receipt.fileId||typeof receipt.fileId!=="string")return false;
  var files=(((page.properties||{})["Obrázok"]||{}).files)||[];
  return files.some(function(f){return f.id===receipt.fileId&&f.type==="file"&&!!(f.file||{}).url;});
}
function psipediaFbExistingSchedules_(pageId,parsed) {
  var cursor=null, seen=0, dayCount=0, collision=false;
  do {
    var q={page_size:100};
    if(cursor)q.start_cursor=cursor;
    var r=psipediaFbNotion_("post","/data_sources/"+PSIPEDIA_FB_DS_ID+"/query",q);
    var rows=r.results||[];
    seen+=rows.length;
    if(seen>1000)throw Error("Notion capacity exceeded: cannot guarantee slot/day availability");
    rows.forEach(function(p){
      if(p.id===pageId)return;
      var status=psipediaFbStatus_(p);
      if(["Naplánované","Schválené","Publikované"].indexOf(status)<0)return;
      var dt=psipediaFbDate_(p);
      var at=Date.parse(dt);
      if(!Number.isFinite(at))return;
      var day=Utilities.formatDate(new Date(at),PSIPEDIA_FB_TZ,"yyyy-MM-dd");
      if(day===parsed.localDay)dayCount++;
      if(Math.floor(at/60000)===Math.floor(parsed.date.getTime()/60000))
        collision=true;
    });
    cursor=r.has_more?r.next_cursor:null;
    if(r.has_more&&!cursor)throw Error("Notion pagination incomplete");
  }while(cursor);
  return {dayCount:dayCount,collision:collision};
}
function psipediaFbPatch_(pageId,properties) {
  return psipediaFbNotion_("patch","/pages/"+encodeURIComponent(pageId),{properties:properties});
}
function psipediaFbSafe_(pageId,note,reason) {
  var props=psipediaFbSafeDraftProperties_(psipediaFbNote_(note,reason));
  psipediaFbPatch_(pageId,props);
  return {scheduled:false,reason:reason};
}
/**
 * Called ONLY after the existing bridge has attached the matching Notion file.
 * The Gmail ID stays the idempotency key. Never edits published/scheduled pages.
 * Script lock protects races between this SAME script's triggers; external
 * Notion/Admin writers require separate D1-side coordination.
 */
/** Record an uploader failure without creating a second page or granting consent. */
function psipediaFbMarkUploadFailed_(message,pageId) {
  var page=psipediaFbNotion_("get","/pages/"+encodeURIComponent(pageId));
  var state=psipediaFbStatus_(page);
  if(state!=="Koncept"&&state!=="Na kontrolu")return {unchanged:true};
  var id=psipediaFbId_(message);
  var note=psipediaFbPlainNote_(page);
  if(note.indexOf(id)<0)throw Error("Notion page missing expected bridge ID");
  return psipediaFbSafe_(pageId,note,"Import PNG/JPEG obrázka do Notion zlyhal; import možno zopakovať.");
}
function psipediaFbFinalizeSchedule_(message,pageId,receipt) {
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(30000))throw Error("Gmail bridge busy: retry");
  try {
    var id=psipediaFbId_(message);
    var page=psipediaFbNotion_("get","/pages/"+encodeURIComponent(pageId));
    var state=psipediaFbStatus_(page);
    if(state!=="Koncept"&&state!=="Na kontrolu")
      return {scheduled:state==="Naplánované",unchanged:true};
    if(psipediaFbPlainNote_(page).indexOf(id)<0)
      throw Error("Notion page missing expected bridge ID");
    var note=psipediaFbPlainNote_(page);
    // Safety FIRST, before parsing, remote queries or upload checks.
    psipediaFbSafe_(pageId,note,"Bezpečný koncept počas kontroly.");
    var payload=psipediaFbPayload_(message);
    if(!payload)return psipediaFbSafe_(pageId,note,"Neplatný JSON alebo marker.");
    if(!psipediaFbSenderVerified_(message))
      return psipediaFbSafe_(pageId,note,"Odosielateľ nebol overený v SENT účte Psipedia.");
    if(typeof payload.title!=="string"||!payload.title.trim()||
       typeof payload.caption!=="string"||!payload.caption.trim())
      return psipediaFbSafe_(pageId,note,"Chýba názov alebo Facebook popis.");
    var importedTitle=psipediaFbText_(page,"Názov","title").trim();
    var importedCaption=psipediaFbText_(page,"Text na Facebook","rich_text").trim();
    if(!importedTitle||!importedCaption||importedTitle!==payload.title.trim()||
       importedCaption!==payload.caption.trim())
      return psipediaFbSafe_(pageId,note,"Názov alebo Facebook popis v Notione chýba alebo nesúhlasí s e-mailom.");
    var image=psipediaFbImage_(message);
    if(!image)return psipediaFbSafe_(pageId,note,"Chýba platná jediná PNG/JPEG príloha.");
    if(!psipediaFbAttachedFileVerified_(page,receipt))
      return psipediaFbSafe_(pageId,note,"Obrázok nebol preukázateľne importovaný do Notion.");
    if(payload.schedule!==true||payload.allow_publishing!==true||payload.owner_approved!==true)
      return psipediaFbSafe_(pageId,note,"Plánovanie alebo jedno z povolení nie je výslovne true.");
    var at=psipediaFbParseBratislavaDate_(payload.publish_at,new Date());
    if(!at)return psipediaFbSafe_(pageId,note,"Neplatný, minulý alebo časovému pásmu nezodpovedajúci termín.");
    if(!psipediaFbImageApproved_(image))
      return psipediaFbSafe_(pageId,note,"Logo/brand asset nie je nezávisle overený (SHA-256).");
    var enabled=PropertiesService.getScriptProperties()
      .getProperty("PSIPEDIA_FB_BRIDGE_SCHEDULE_ENABLED")==="true";
    if(!enabled)return psipediaFbSafe_(pageId,note,"Plánovací mostík zatiaľ nie je aktivovaný.");
    var occupied=psipediaFbExistingSchedules_(pageId,at);
    if(occupied.collision)
      return psipediaFbSafe_(pageId,note,"Termín je už obsadený iným príspevkom.");
    if(occupied.dayCount>=5)
      return psipediaFbSafe_(pageId,note,"Na tento deň je už naplánovaných/publikovaných päť FB obrázkov.");
    var props={
      "Stav":{status:{name:"Naplánované"}},
      "Dátum a čas publikovania":{date:{start:at.iso}},
      "Povoliť publikovanie":{checkbox:true},
      "Súhlas majiteľa – priame publikovanie":{checkbox:true},
      "Poznámka":psipediaFbRich_(psipediaFbNote_(note,"Bezpečnostné kontroly prešli; čas a logo overené."))
    };
    psipediaFbPatch_(pageId,props);
    return {scheduled:true,publish_at:at.iso};
  } finally {lock.releaseLock();}
}
