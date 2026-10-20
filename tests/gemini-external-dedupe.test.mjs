import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { checkExternalGeminiIdentity } from "../lib/gemini-external-dedupe.ts";
const SECRET="offline-dedupe-secret";
const directory=["veterinari","treneri","kynologicke-kluby","chovatelske-kluby","chovatelske-stanice",
  "salony-a-sluzby","hotely-a-opatrovanie","vencenie","fyzioterapia","dalsie-sluzby"];
const events=["vystavy","preteky","seminare","treningy","stretnutia","dalsie"];
const help=["docasna-opatera","zbierky","dobrovolnictvo","utulky","adopcia","stratene-a-najdene"];
const sample={
  name:"Klinika Nitra",city:"Nitra",website:"https://klinika.sk/",source:"https://klinika.sk/o-nas",
  start_date:"2026-11-20",organizer:"Klub Nitra",venue:"Nitra",
};
function db(stableKey,{profile=null,event=null,job=true,throws=false}={}){
  return {prepare(sql){
    let args=[];
    const s={
      bind(...v){args=v;return s},
      async first(){
        if(throws)throw Error("OFFLINE_D1_UNAVAILABLE");
        if(sql.includes("FROM gemini_manual_background_jobs"))
          return job?{stable_key:stableKey,status:"RUNNING",error_code:"EXT_MANUAL"}:null;
        return null;
      },
      async all(){
        if(throws)throw Error("OFFLINE_D1_UNAVAILABLE");
        if(sql.includes("FROM directory_profiles"))return {results:profile?[profile]:[]};
        if(sql.includes("FROM managed_events"))return {results:event?[event]:[]};
        return {results:[]};
      },
    };
    return s;
  }};
}
const directoryMatch={id:1,category:"veterinari",status:"published",name:"Klinika Nitra",
  city:"Nitra",website_url:"https://klinika.sk/",source_data_json:"{}"};
const eventMatch={id:2,title:"Klinika Nitra",organizer:"Klub Nitra",start_date:"2026-11-20",
  end_date:null,venue:"Nitra",city:"Nitra",website_url:"https://klinika.sk/",
  event_url:"https://klinika.sk/",registration_url:null,event_type:"vystava",status:"published",cancelled:0};
async function decision(stableKey, options={}){
  const now=Date.now();
  const payload={job_id:7,stable_key:stableKey,issued_at:options.issuedAt??now,
    candidate:{...sample,...options.candidate}};
  const body=JSON.stringify(payload);
  const signature="sha256="+createHmac("sha256",SECRET).update(body).digest("hex");
  return checkExternalGeminiIdentity({
    db:db(stableKey,options),
    env:{GEMINI_EXTERNAL_AGENT_ENABLED:"true",GEMINI_AGENT_CALLBACK_SECRET:SECRET},
    body,signature:options.badSignature?"sha256="+"0".repeat(64):signature,now,
  });
}
for(const category of directory){
  test("directory."+category+" signed read-only NEW",async()=>{
    const r=await decision("directory."+category);
    assert.deepEqual(r,{httpStatus:200,status:"NEW"});
  });
}
for(const category of events){
  test("events."+category+" signed read-only NEW",async()=>{
    const r=await decision("events."+category);
    assert.deepEqual(r,{httpStatus:200,status:"NEW"});
  });
}
for(const category of help){
  test("help."+category+" is BLOCKED instead of claiming canonical check",async()=>{
    const r=await decision("help."+category);
    assert.deepEqual(r,{httpStatus:200,status:"BLOCKED"});
  });
}
test("published directory canonical row forbids duplicate",async()=>{
  assert.deepEqual(await decision("directory.veterinari",{profile:directoryMatch}),
    {httpStatus:200,status:"DUPLICATE"});
});
test("same name and city with different website requires human resolution",async()=>{
  assert.deepEqual(await decision("directory.veterinari",{profile:{...directoryMatch,website_url:"https://another.sk"}}),
    {httpStatus:200,status:"POSSIBLE_DUPLICATE"});
});
test("published event with same identity and date forbids duplicate",async()=>{
  assert.deepEqual(await decision("events.vystavy",{event:eventMatch}),
    {httpStatus:200,status:"DUPLICATE"});
});
test("events on different dates are NEW",async()=>{
  assert.deepEqual(await decision("events.vystavy",{event:{...eventMatch,start_date:"2026-12-20"}}),
    {httpStatus:200,status:"NEW"});
});
test("unauthorized, stale or missing job fails closed",async()=>{
  assert.equal((await decision("directory.veterinari",{badSignature:true})).httpStatus,401);
  assert.equal((await decision("directory.veterinari",{issuedAt:Date.now()-180000})).httpStatus,400);
  assert.equal((await decision("directory.veterinari",{job:false})).httpStatus,409);
});
test("D1 unavailable does not produce NEW",async()=>{
  assert.deepEqual(await decision("directory.veterinari",{throws:true}),
    {httpStatus:503,status:"BLOCKED"});
});
test("missing required source evidence does not produce NEW",async()=>{
  assert.equal((await decision("directory.veterinari",{candidate:{website:"",source:""}})).status,"BLOCKED");
  assert.equal((await decision("events.vystavy",{candidate:{organizer:""}})).status,"BLOCKED");
});
