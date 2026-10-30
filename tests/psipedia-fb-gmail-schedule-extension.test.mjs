import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {createHash} from "node:crypto";

const code=readFileSync(new URL("../scripts/apps-script/psipedia-fb-gmail-schedule-extension.gs",import.meta.url),"utf8");
const mailId="1a18c6aef846c4b3";
const bridgeId="PSIPEDIA-GMAIL-"+mailId;
const original={marker:"PSIPEDIA_FB_IMAGE_V1",title:"3 psie športy",caption:"Celý slovenský popis"};
const ready={...original,publish_at:"2030-10-31T12:15:00+01:00",schedule:true,allow_publishing:true,owner_approved:true};
const png=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,1]);
const digest=createHash("sha256").update(png).digest("hex");

function localFormat(date,pattern){
  const fmt=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Bratislava",
    year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",
    minute:"2-digit",second:"2-digit",hourCycle:"h23"});
  const obj=Object.fromEntries(fmt.formatToParts(date).map(x=>[x.type,x.value]));
  const local=obj.year+"-"+obj.month+"-"+obj.day+"T"+obj.hour+":"+obj.minute+":"+obj.second;
  if(pattern==="yyyy-MM-dd")return local.slice(0,10);
  if(pattern!=="Z")return local;
  const naive=Date.parse(local+"Z"),delta=Math.round((naive-date.getTime())/60000);
  const sign=delta>=0?"+":"-";
  return sign+String(Math.floor(Math.abs(delta)/60)).padStart(2,"0")+
    String(Math.abs(delta)%60).padStart(2,"0");
}
function props(status="Koncept",id=bridgeId,uploaded=true) {
  return {
    "Názov":{title:[{plain_text:"3 psie športy"}]},
    "Text na Facebook":{rich_text:[{plain_text:"Celý slovenský popis"}]},
    "Poznámka":{rich_text:[{plain_text:"Importovaný Gmail. Bridge ID: "+id}]},
    "Stav":{status:{name:status}},
    "Dátum a čas publikovania":{date:null},
    "Povoliť publikovanie":{checkbox:true},
    "Súhlas majiteľa – priame publikovanie":{checkbox:false},
    "Obrázok":{files:uploaded?[{id:"notion-file-1",type:"file",file:{url:"https://notion.so/upload.png"}}]:[]}
  };
}
function fixture(opts={}) {
  const state={pages:opts.pages||[{id:"notion-page-1",properties:props(opts.status||"Koncept",bridgeId,opts.uploaded!==false)}],
    calls:[],sentSearchCalls:0};
  const message={
    getId:()=>mailId,
    getPlainBody:()=>opts.body??JSON.stringify(opts.json||ready),
    getFrom:()=>opts.from||"\"Psipedia\" <psipedia.sk@gmail.com>",
    getAttachments:()=>opts.attachment===false?[]:[{
      getBytes:()=>Array.from(opts.imageBytes||png),
      getContentType:()=>opts.imageMime||"image/png"
    }]
  };
  const settings={
    NOTION_API_TOKEN:"fake-test-token",
    PSIPEDIA_FB_BRIDGE_SCHEDULE_ENABLED:opts.enabled===false?"false":"true",
    PSIPEDIA_FB_APPROVED_IMAGE_SHA256:opts.brand===false?"":digest
  };
  const scope={
    Date,Number,String,Array,Object,JSON,Error,Math,RegExp,encodeURIComponent,
    Session:{getEffectiveUser:()=>({getEmail:()=>opts.sessionEmail||"psipedia.sk@gmail.com"})},
    GmailApp:{search:(q,offset,max)=>{
      state.sentSearchCalls++;
      return opts.notSent?[]:[{getMessages:()=>[message]}];
    }},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>settings[k]||null})},
    Utilities:{
      formatDate:(d,tz,format)=>{assert.equal(tz,"Europe/Bratislava");return localFormat(d,format);},
      DigestAlgorithm:{SHA_256:"SHA_256"},
      computeDigest:(alg,bytes)=>Array.from(createHash("sha256").update(Buffer.from(bytes)).digest())
    },
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
    UrlFetchApp:{fetch:(url,req)=>{
      assert.match(url,/^https:\/\/api\.notion\.com\/v1/);
      assert.equal(req.headers["Notion-Version"],"2025-09-03");
      const path=url.replace("https://api.notion.com/v1","");
      const data=req.payload?JSON.parse(req.payload):null;
      state.calls.push({path,method:req.method,payload:data});
      let result;
      if(path.endsWith("/query")) {
        let list=state.pages;
        if(data.filter?.property==="Poznámka"){
          list=list.filter(p=>p.properties["Poznámka"].rich_text[0].plain_text.includes(data.filter.rich_text.contains));
        }
        result={results:list,has_more:false};
      }else if(path.startsWith("/pages/")){
        const id=decodeURIComponent(path.slice("/pages/".length));
        const page=state.pages.find(x=>x.id===id);
        if(!page)throw Error("fixture: page not found");
        if(req.method==="patch")Object.assign(page.properties,data.properties);
        result=page;
      }else throw Error("fixture: unexpected Notion request "+path);
      return {getResponseCode:()=>200,getContentText:()=>JSON.stringify(result)};
    }}
  };
  vm.createContext(scope);
  vm.runInContext(code,scope,{filename:"psipedia-fb-gmail-schedule-extension.gs"});
  return {state,scope,message,run:()=>scope.psipediaFbFinalizeSchedule_(message,"notion-page-1",{fileId:"notion-file-1"})};
}
function assertDraft(f,reason) {
  const page=f.state.pages[0].properties;
  assert.equal(page.Stav.status.name,"Koncept");
  assert.equal(page["Povoliť publikovanie"].checkbox,false);
  assert.equal(page["Súhlas majiteľa – priame publikovanie"].checkbox,false);
  assert.equal(page["Dátum a čas publikovania"].date,null);
  assert.match(page["Poznámka"].rich_text[0].text.content,reason);
}

test("1: old JSON without optional fields imports as safe concept",()=>{
  const f=fixture({json:original});assert.equal(f.run().scheduled,false);assertDraft(f,/Plánovanie/);
});
test("2: authorized future schedule writes exact offset and both consents",()=>{
  const f=fixture();const r=f.run();
  assert.equal(r.scheduled,true);
  assert.equal(f.state.pages[0].properties.Stav.status.name,"Naplánované");
  assert.equal(f.state.pages[0].properties["Dátum a čas publikovania"].date.start,ready.publish_at);
  assert.equal(f.state.pages[0].properties["Povoliť publikovanie"].checkbox,true);
  assert.equal(f.state.pages[0].properties["Súhlas majiteľa – priame publikovanie"].checkbox,true);
});
test("3: invalid/missing/past schedule fails closed",()=>{
  for(const value of ["2030-10-31T12:15:00","2030-02-30T12:15:00+01:00","2020-01-01T12:15:00+01:00","2030-10-31"]){
    const f=fixture({json:{...ready,publish_at:value}});assert.equal(f.run().scheduled,false);assertDraft(f,/Neplatný/);
  }
});
test("4: existing scheduled slot (same minute) blocks scheduling",()=>{
  const other={id:"other",properties:props("Naplánované","OTHER")};
  other.properties["Dátum a čas publikovania"].date={start:"2030-10-31T12:15:35+01:00"};
  const f=fixture({pages:[{id:"notion-page-1",properties:props()},other]});
  assert.equal(f.run().scheduled,false);assertDraft(f,/obsadený/);
});
test("5: five already scheduled images in same Bratislava calendar day blocks sixth",()=>{
  const more=Array.from({length:5},(_,i)=>{
    const p={id:"other-"+i,properties:props("Naplánované","OTHER-"+i)};
    p.properties["Dátum a čas publikovania"].date={start:"2030-10-31T"+String(13+i).padStart(2,"0")+":15:00+01:00"};
    return p;
  });
  const f=fixture({pages:[{id:"notion-page-1",properties:props()},...more]});
  assert.equal(f.run().scheduled,false);assertDraft(f,/päť/);
});
test("6: absent/mismatched PNG/JPEG attachment fails closed",()=>{
  for(const opt of [{attachment:false},{imageBytes:Buffer.from("not an image")}]) {
    const f=fixture(opt);assert.equal(f.run().scheduled,false);assertDraft(f,/PNG\/JPEG/);
  }
});
test("7: spoof sender and message missing in authenticated SENT fail closed",()=>{
  for(const opt of [{from:"attacker@example.com"},{notSent:true},{sessionEmail:"other@example.com"}]){
    const f=fixture(opt);assert.equal(f.run().scheduled,false);assertDraft(f,/Odosielateľ/);
  }
});
test("8: repeated Gmail ID does not change scheduled or published content",()=>{
  for(const status of ["Naplánované","Publikované"]){
    const f=fixture({status});const before=JSON.stringify(f.state.pages[0]);
    const response=f.run();assert.equal(response.unchanged,true);
    assert.equal(JSON.stringify(f.state.pages[0]),before);
    assert.equal(f.state.calls.filter(x=>x.method==="patch").length,0);
  }
  const f=fixture();assert.equal(f.scope.psipediaFbFindByGmailId_(mailId).id,"notion-page-1");
});
test("9: incomplete Notion image import stays unapproved and retryable",()=>{
  const f=fixture({uploaded:false});assert.equal(f.run().scheduled,false);assertDraft(f,/nebol/);
  f.state.pages[0].properties["Obrázok"].files=[{id:"notion-file-1",type:"file",file:{url:"https://notion.so/upload.png"}}];
  assert.equal(f.run().scheduled,true);
});
test("10: DST validates winter, summer, spring gap, autumn duplicate hour",()=>{
  const f=fixture();
  const check=(s)=>f.scope.psipediaFbParseBratislavaDate_(s,new Date("2026-01-01T00:00:00Z"));
  assert.ok(check("2030-01-01T12:15:00+01:00"));
  assert.ok(check("2030-07-01T12:15:00+02:00"));
  assert.equal(check("2027-03-28T02:30:00+01:00"),null);
  assert.ok(check("2027-10-31T02:30:00+01:00"));
  assert.ok(check("2027-10-31T02:30:00+02:00"));
});
test("11: missing independent brand approval never schedules",()=>{
  const f=fixture({brand:false});assert.equal(f.run().scheduled,false);assertDraft(f,/logo\/brand/i);
});
test("12: any false permission or schedule flag remains concept",()=>{
  for(const obj of [{schedule:false},{allow_publishing:false},{owner_approved:false}]){
    const f=fixture({json:{...ready,...obj}});assert.equal(f.run().scheduled,false);assertDraft(f,/povolení/);
  }
});
test("feature flag off remains concept, never sends email or calls Facebook",()=>{
  const f=fixture({enabled:false});assert.equal(f.run().scheduled,false);assertDraft(f,/aktivovaný/);
  assert.ok(f.state.calls.every(x=>x.path.startsWith("/pages/")||x.path.includes("/data_sources/")));
});
test("invalid JSON remains concept and both permissions disabled",()=>{
  const f=fixture({body:"not JSON"});assert.equal(f.run().scheduled,false);assertDraft(f,/JSON/);
});
test("duplicate bridge marker found in two Notion rows throws, no new page",()=>{
  const p={id:"other",properties:props()};
  const f=fixture({pages:[{id:"notion-page-1",properties:props()},p]});
  assert.throws(()=>f.scope.psipediaFbFindByGmailId_(mailId),/Duplicate/);
  assert.equal(f.state.calls.some(x=>x.method==="post"&&x.path==="/pages"),false);
});


test("missing or mismatched imported title/caption cannot be scheduled",()=>{
  const f=fixture();
  f.state.pages[0].properties["Text na Facebook"].rich_text=[{plain_text:"Iný obsah"}];
  assert.equal(f.run().scheduled,false);
  assertDraft(f,/nesúhlasí/);
});
test("failure to upload image records a safe and retryable Notion draft",()=>{
  const f=fixture({uploaded:false});
  f.scope.psipediaFbMarkUploadFailed_(f.message,"notion-page-1");
  assertDraft(f,/Import PNG\/JPEG obrázka do Notion zlyhal/);
});
test("existing approved page is not overwritten by bridge retry",()=>{
  const f=fixture({status:"Schválené"});
  assert.equal(f.run().unchanged,true);
  assert.equal(f.state.calls.some(x=>x.method==="patch"),false);
});
