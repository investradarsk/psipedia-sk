import test from "node:test";
import assert from "node:assert/strict";
import { Client, signWebhookPayload, verifyWebhookSignature } from "@notionhq/client";
import { notionRequest } from "../lib/notion-sync-shared.ts";
import { verifyNotionWebhook } from "../lib/notion-webhook-contract.ts";

const binding = { NOTION_API_TOKEN: "secret_test_token_not_real" };
const ok = (body) => new Response(JSON.stringify(body), {
  status: 200, headers: { "content-type": "application/json" },
});

async function withMockFetch(mock, run) {
  const old = globalThis.fetch;
  globalThis.fetch = mock;
  try { return await run(); } finally { globalThis.fetch = old; }
}

test("uses official Notion SDK for raw-body webhook verification, rejects tampering", async () => {
  const raw = '{"id":"00000000-0000-0000-0000-000000000001","entity":{"type":"page"}}';
  const verificationToken = "secret_example_only";
  const signature = await signWebhookPayload({body:raw,verificationToken});
  assert.equal(await verifyWebhookSignature({body:raw,verificationToken,signature}),true);
  assert.equal(await verifyNotionWebhook(raw,signature,verificationToken),true);
  assert.equal(await verifyNotionWebhook(raw+" ",signature,verificationToken),false);
  assert.equal(await verifyNotionWebhook(raw,signature,""),false);
  assert.equal(await verifyNotionWebhook(raw,null,verificationToken),false);
});

test("SDK transport retrieves a single page with version and bearer token on server", async () => {
  const seen=[];
  await withMockFetch(async (url,init)=>{
    seen.push({url:String(url),method:init.method,headers:new Headers(init.headers),body:init.body});
    return ok({object:"page",id:"00000000-0000-0000-0000-000000000001"});
  }, async ()=>{
    const r=await notionRequest(binding,"/pages/00000000-0000-0000-0000-000000000001");
    assert.equal(r.object,"page");
  });
  assert.equal(seen.length,1);
  assert.equal(seen[0].url,"https://api.notion.com/v1/pages/00000000-0000-0000-0000-000000000001");
  assert.equal(seen[0].method.toLowerCase(),"get");
  assert.equal(seen[0].headers.get("notion-version"),"2025-09-03");
  assert.equal(seen[0].headers.get("authorization"),"Bearer "+binding.NOTION_API_TOKEN);
  assert.ok(!seen[0].body);
});

test("SDK transport sends only the requested Notion field and preserves cursor query", async () => {
  const seen=[];
  await withMockFetch(async (url,init)=>{
    seen.push({url:String(url),method:init.method,body:init.body});
    return ok({results:[],has_more:false});
  }, async ()=>{
    await notionRequest(binding,"/data_sources/11111111-1111-1111-1111-111111111111/query?filter_properties=Deti",{
      method:"POST",body:JSON.stringify({filter:{property:"Deti",number:{equals:4}},page_size:5}),
    });
  });
  assert.equal(seen.length,1);
  assert.equal(new URL(seen[0].url).pathname,"/v1/data_sources/11111111-1111-1111-1111-111111111111/query");
  assert.equal(new URL(seen[0].url).searchParams.get("filter_properties"),"Deti");
  assert.equal(seen[0].method.toLowerCase(),"post");
  assert.deepEqual(JSON.parse(seen[0].body),{filter:{property:"Deti",number:{equals:4}},page_size:5});
});

test("SDK transport preserves PATCH semantics and does not rewrite other fields",async()=>{
  let body;
  await withMockFetch(async (_url,init)=>{
    body=JSON.parse(init.body);
    return ok({object:"page"});
  },async()=>{
    await notionRequest(binding,"/pages/00000000-0000-0000-0000-000000000001",{
      method:"PATCH",body:JSON.stringify({properties:{"Deti":{number:4}}}),
    });
  });
  assert.deepEqual(body,{properties:{"Deti":{number:4}}});
});

test("SDK transport rejects missing tokens, unsafe paths, methods and non-JSON",async()=>{
  let called=0;
  await withMockFetch(async()=>{called++;return ok({})},async()=>{
    await assert.rejects(()=>notionRequest({},"/pages/1"),/NOTION_API_TOKEN/);
    await assert.rejects(()=>notionRequest(binding,"https://other.example/path"),/UNSAFE_API_PATH/);
    await assert.rejects(()=>notionRequest(binding,"//other.example/path"),/UNSAFE_API_PATH/);
    await assert.rejects(()=>notionRequest(binding,"/pages/1",{method:"PUT"}),/UNSUPPORTED_METHOD/);
    await assert.rejects(()=>notionRequest(binding,"/pages/1",{method:"POST",body:"[]"}),/JSON_OBJECT_REQUIRED/);
  });
  assert.equal(called,0);
});

test("SDK transport preserves bounded Notion retry semantics (429) and HTTP errors",async()=>{
  let calls=0;
  await withMockFetch(async()=>{
    calls++;
    if(calls===1)return new Response(JSON.stringify({object:"error",code:"rate_limited",message:"Back off"}),{
      status:429,headers:{"content-type":"application/json","retry-after":"0"}});
    return ok({object:"page",id:"2"});
  },async()=>{
    const r=await notionRequest(binding,"/pages/2");
    assert.equal(r.id,"2");
  });
  assert.equal(calls,2);
  await withMockFetch(async()=>new Response(JSON.stringify({object:"error",code:"object_not_found",message:"Not found"}),{
    status:404,headers:{"content-type":"application/json"},
  }),async()=>{
    await assert.rejects(()=>notionRequest(binding,"/pages/3"),/Notion API 404/);
  });
});

test("official SDK is pinned to the validated Workers-compatible major",()=>{
  assert.equal(typeof Client,"function");
});
