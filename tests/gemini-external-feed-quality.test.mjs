import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { createHmac } from "node:crypto";
register("./cloudflare-loader.mjs",import.meta.url);
const {safeGeminiFeedQualityFields,submitGeminiFeedQualityProposal}=
  await import("../lib/gemini-external-feed-quality.ts");
const {geminiFeedQualityProposal}=
  await import("../scripts/gemini-notion-preflight.mjs");
const {submitGeminiDirectoryQualityProposal}=
  await import("../lib/gemini-external-quality-proposals.ts");

const identity={
  name:"Pomoc útulku",city:"Nitra",website:"https://example.sk/",
  source:"https://example.sk/case",start_date:"2026-11-20",
  organizer:"OZ Pomoc",venue:"Nitra",type:"FOUND",
};
const generic={id:17,title:"Pomoc útulku",category:"zbierky",city:"Nitra",
  organization:"OZ Pomoc",action_url:"https://example.sk/case",excerpt:"Pôvodný text"};
function mock(opts={}){
  const writes=[];
  return {writes,db:{prepare(sql){
    let args=[];
    const stmt={bind(...values){args=values;return stmt},
      async all(){
        if(opts.down)throw Error("D1 unavailable");
        if(sql.includes("FROM help_cases"))return {results:opts.ambiguous?[generic,{...generic,id:18}]:[opts.canonical??generic]};
        if(sql.includes("JOIN automation_observations"))
          return {results:opts.noProvenance?[]:opts.multipleProvenance
            ?[{id:22,observation_id:33},{id:23,observation_id:34}]
            :[{id:22,observation_id:33}]};
        return {results:[]};
      },
      async run(){writes.push({sql,args});return {success:true}},
      async first(){
        if(sql.includes("FROM gemini_manual_background_jobs"))
          return {stable_key:"help.zbierky",status:"RUNNING",error_code:"EXT_MANUAL"};
        return null;
      }
    };
    return stmt;
  }}};
}
test("all six events and all six Help categories expose strictly public field maps",()=>{
  const pairs={
    "help.docasna-opatera":{excerpt:"Perex",actionUrl:"Web"},
    "help.zbierky":{excerpt:"Perex",actionUrl:"Web"},
    "help.dobrovolnictvo":{excerpt:"Perex",actionUrl:"Web"},
    "help.utulky":{shortDescription:"Krátky popis",websiteUrl:"Web"},
    "help.adopcia":{shortDescription:"Krátky popis",breedName:"Plemeno",color:"Farba"},
    "help.stratene-a-najdene":{dogName:"Meno psa",breed:"Plemeno",color:"Farba"},
  };
  const source={"Perex":{rich_text:[{text:{content:"Nové informácie"}}]},
    "Web":{url:"https://example.sk/case"},
    "Krátky popis":{rich_text:[{text:{content:"Nové informácie"}}]},
    "Plemeno":{rich_text:[{text:{content:"Labrador"}}]},
    "Farba":{rich_text:[{text:{content:"Čierna"}}]},
    "Meno psa":{rich_text:[{text:{content:"Neo"}}]}};
  for(const [key,map] of Object.entries(pairs)){
    const proposal=geminiFeedQualityProposal(key,source);
    assert.deepEqual(Object.keys(proposal).sort(),Object.keys(map).sort());
    assert.deepEqual(safeGeminiFeedQualityFields(key,proposal),proposal);
  }
  for(const cat of ["vystavy","preteky","seminare","treningy","stretnutia","dalsie"]){
    const proposal=geminiFeedQualityProposal("events."+cat,source);
    assert.equal(proposal.excerpt,"Nové informácie");
    assert.equal(proposal.websiteUrl,"https://example.sk/case");
  }
});
test("known canonical plus approved source+observation+provenance writes review-only finding",async()=>{
  const d=mock();
  const result=await submitGeminiFeedQualityProposal({
    db:d.db,key:"help.zbierky",candidate:identity,proposal:{excerpt:"Aktualizácia textu"},now:Date.now()
  });
  assert.deepEqual(result,{status:"REVIEW_SUBMITTED",httpStatus:200});
  assert.equal(d.writes.length,1);
  const {sql,args}=d.writes[0];
  assert.match(sql,/INSERT INTO automation_findings/);
  assert.match(sql,/ON CONFLICT\(fingerprint\) DO NOTHING/);
  assert.doesNotMatch(sql,/UPDATE help_cases|UPDATE managed_events|UPDATE adoption_dogs/);
  assert.deepEqual(args.slice(0,5),[22,33,"HELP_ITEM",17,"https://example.sk/case"]);
  assert.deepEqual(JSON.parse(args[6]),{excerpt:"Aktualizácia textu"});
  assert.deepEqual(JSON.parse(args[7]),{excerpt:{before:"Pôvodný text",after:"Aktualizácia textu"}});
});
test("no proven registered source, multiple matches, and D1 errors fail closed",async()=>{
  for(const options of [{noProvenance:true},{multipleProvenance:true},{ambiguous:true},{down:true},
      {canonical:{...generic,title:"Iná vec"}}]){
    const d=mock(options);
    const result=await submitGeminiFeedQualityProposal({
      db:d.db,key:"help.zbierky",candidate:identity,proposal:{excerpt:"Aktualizácia"},now:Date.now()
    });
    assert.equal(result.status,"BLOCKED");
    assert.equal(d.writes.length,0);
  }
});
test("unchanged proposal never enters the queue",async()=>{
  const d=mock();
  const result=await submitGeminiFeedQualityProposal({
    db:d.db,key:"help.zbierky",candidate:identity,proposal:{excerpt:"Pôvodný text"},now:Date.now()
  });
  assert.deepEqual(result,{status:"NO_CHANGES",httpStatus:200});
  assert.equal(d.writes.length,0);
});
test("no private fields, GPS, untrusted URLs, or lifecycle/publication keys",()=>{
  for(const [key,proposed] of [
    ["help.adopcia",{phone:"+421 905 123 456"}],
    ["help.zbierky",{excerpt:"GPS 48.123456,18.123456"}],
    ["help.stratene-a-najdene",{locationDescription:"Byt 42"}],
    ["events.vystavy",{registrationUrl:"http://127.0.0.1"}],
    ["help.utulky",{publicEmail:"person@example.sk"}],
    ["events.vystavy",{status:"published"}],
  ])assert.equal(safeGeminiFeedQualityFields(key,proposed),null);
});

test("full signed external-worker Help request reaches existing FEED_SOURCE reviews",async()=>{
  const secret="offline-quality-feed-secret",now=Date.now();
  const payload={job_id:7,stable_key:"help.zbierky",issued_at:now,
    candidate:identity,proposal:{excerpt:"Aktualizácia textu"}};
  const body=JSON.stringify(payload);
  const signature="sha256="+createHmac("sha256",secret).update(body).digest("hex");
  const db=mock();
  const valid=await submitGeminiDirectoryQualityProposal({
    db:db.db,env:{GEMINI_AGENT_CALLBACK_SECRET:secret,GEMINI_EXTERNAL_AGENT_ENABLED:"true"},
    body,signature,now,
  });
  assert.deepEqual(valid,{status:"REVIEW_SUBMITTED",httpStatus:200});
  assert.equal(db.writes.length,1);
  const invalid=await submitGeminiDirectoryQualityProposal({
    db:db.db,env:{GEMINI_AGENT_CALLBACK_SECRET:secret,GEMINI_EXTERNAL_AGENT_ENABLED:"true"},
    body,signature:"sha256="+"0".repeat(64),now,
  });
  assert.deepEqual(invalid,{status:"BLOCKED",httpStatus:401});
  assert.equal(db.writes.length,1);
});
