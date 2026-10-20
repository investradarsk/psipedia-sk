import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { register } from "node:module";
register("./cloudflare-loader.mjs", import.meta.url);
const { submitGeminiDirectoryQualityProposal } = await import("../lib/gemini-external-quality-proposals.ts");
import { geminiDirectoryQualityProposal } from "../scripts/gemini-notion-preflight.mjs";

const SECRET="offline-quality-secret";
const candidate={
  name:"Klinika Nitra",city:"Nitra",website:"https://klinika.sk/",
  source:"https://klinika.sk/o-nas",start_date:"",organizer:"",venue:"",type:"",
};
function database(input={}) {
  const writes=[];
  const row={id:13,category:"veterinari",name:"Klinika Nitra",
    city:"Nitra",website_url:"https://klinika.sk/",source_data_json:"{}",...input.row};
  return {writes,db:{prepare(sql){
    let bind=[];
    const s={bind(...args){bind=args;return s},
      async first(){
        if(input.error)throw Error("D1_OFFLINE_ERROR");
        if(sql.includes("FROM gemini_manual_background_jobs"))
          return input.missingJob?null:{stable_key:"directory.veterinari",status:"RUNNING",error_code:"EXT_MANUAL"};
        if(sql.includes("SELECT id,category,name,city,website_url,source_data_json"))
          return input.missingRow?null:row;
        return null;
      },
      async all(){
        if(input.error)throw Error("D1_OFFLINE_ERROR");
        if(sql.includes("FROM directory_profiles"))return {results:input.noMatch?[]:[row]};
        return {results:[]};
      },
      async run(){writes.push({sql,bind});return {success:true}},
    };
    return s;
  }}};
}
async function submit(data={},db=database()){
  const now=Date.now();
  const payload={
    job_id:7,stable_key:"directory.veterinari",issued_at:now,
    candidate:{...candidate,...data.candidate},
    proposal:data.proposal??{publicPhone:"+421 915 555 999"},
  };
  const body=JSON.stringify({...payload,...data.extra});
  const signature="sha256="+createHmac("sha256",SECRET).update(body).digest("hex");
  const result=await submitGeminiDirectoryQualityProposal({
    db:db.db,
    env:{GEMINI_EXTERNAL_AGENT_ENABLED:"true",GEMINI_AGENT_CALLBACK_SECRET:SECRET},
    body,signature:data.invalidSignature?"sha256="+"0".repeat(64):signature,
    now:data.stale?now+180000:now,
  });
  return {result,writes:db.writes};
}

test("strict signed, canonical exact Directory match creates only manual-review suggestion",async()=>{
  const {result,writes}=await submit();
  assert.deepEqual(result,{status:"REVIEW_SUBMITTED",httpStatus:200});
  assert.equal(writes.length,1);
  const [{sql,bind}]=writes;
  assert.match(sql,/INSERT INTO automation_update_suggestions/);
  assert.match(sql,/POSSIBLE_UPDATE|ON CONFLICT/);
  assert.equal(bind[0],"DIRECTORY");
  assert.equal(bind[1],13);
  assert.equal(bind[2],"veterinari");
  assert.match(bind[3],/^https:\/\/klinika.sk\//);
  assert.equal(bind[5],"POSSIBLE_UPDATE");
  const proposed=JSON.parse(bind[7]);
  const diff=JSON.parse(bind[8]);
  assert.deepEqual(proposed,{publicPhone:"+421 915 555 999"});
  assert.deepEqual(diff,{publicPhone:{before:null,after:"+421 915 555 999"}});
  assert.ok(!JSON.stringify(bind).includes("password"));
});
test("unchanged public data does not create noise",async()=>{
  const {result,writes}=await submit({proposal:{websiteUrl:"https://klinika.sk/"}});
  assert.deepEqual(result,{status:"NO_CHANGES",httpStatus:200});
  assert.equal(writes.length,0);
});
test("bad signature, stale token, missing job, incomplete or miscategorized entity fail closed",async()=>{
  for(const [data,db] of [
    [{invalidSignature:true},database()],
    [{stale:true},database()],
    [{},database({missingJob:true})],
    [{},database({row:{category:"treneri"}})],
    [{},database({row:{city:"Trnava"}})],
    [{candidate:{website:"https://another.sk"}},database()],
    [{},database({error:true})],
  ]){
    const {result,writes}=await submit(data,db);
    assert.equal(result.status,"BLOCKED");
    assert.equal(writes.length,0);
  }
});
test("unknown or unsafe review fields do not reach D1",async()=>{
  for(const proposal of [
    {latitude:"48.123456"}, {publicEmail:"invalid"}, {websiteUrl:"http://127.0.0.1"},
    {facebookUrl:"https://evil.facebook.com.attacker.invalid"}, {publicPhone:"123"},
  ]){
    const {result,writes}=await submit({proposal});
    assert.equal(result.status,"BLOCKED");
    assert.equal(writes.length,0);
  }
});
test("public Directory extractor never exports private location or lifecycle fields",()=>{
  const props={
    "Telefón":{phone_number:"+421 915 555 999"},
    "E-mail":{email:"verejne@example.com"},
    "Adresa":{rich_text:[{text:{content:"Súkromná 42"}}]},
    "Latitude":{number:48.12},"Popis":{rich_text:[{text:{content:"Súkromné detaily"}}]},
    "Web":{url:"https://klinika.sk/"},
  };
  assert.deepEqual(geminiDirectoryQualityProposal("directory.veterinari",props),{
    websiteUrl:"https://klinika.sk/",publicPhone:"+421 915 555 999",publicEmail:"verejne@example.com",
  });
  assert.deepEqual(geminiDirectoryQualityProposal("help.stratene-a-najdene",props),{});
});
