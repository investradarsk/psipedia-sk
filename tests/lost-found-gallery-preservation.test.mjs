import assert from "node:assert/strict";
import test from "node:test";
import { env } from "cloudflare:workers";
import { updateAdminDogReport } from "../lib/lost-found-dog-store.ts";

function fixture() {
  const row = {id: 41, type:"FOUND",status:"DRAFT",slug:"found-dog",dog_name:"Pes", gallery_json:JSON.stringify(["/media/one.webp","/media/two.webp"]),updated_at:"2026-10-01T00:00:00Z",description:"",breed:"",color:"",city:"",region:"",district:"",search_text:""};
  const updates = [];
  env.PII_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64url");
  env.PII_HASH_KEY = Buffer.alloc(32, 2).toString("base64url");
  env.DB = {
    prepare(sql) {
      return {sql,args:[],bind(...args){this.args=args;return this;},async first(){return row;}};
    },
    async batch(statements) {
      for (const statement of statements) {
        if (statement.sql.startsWith("UPDATE lost_found_dog_reports SET")) {
          const columns = statement.sql.split(" SET")[1].split(" WHERE")[0].split(",").map(part=>part.trim().split("=")[0]);
          const gallery = statement.args[columns.indexOf("gallery_json")];
          updates.push(JSON.parse(gallery)); row.gallery_json=gallery;
        }
      }
      return statements.map(()=>({meta:{changes:1}}));
    },
  };
  return {updates};
}

test("editing an old client payload preserves omitted gallery, while explicit removal and reorder work", async () => {
  const {updates}=fixture();
  try {
    await updateAdminDogReport(41,{type:"FOUND",slug:"found-dog",dogName:"Upravený pes"},"fixture");
    assert.deepEqual(updates.at(-1),["/media/one.webp","/media/two.webp"]);
    await updateAdminDogReport(41,{type:"FOUND",gallery:["/media/two.webp","/media/one.webp"]},"fixture");
    assert.deepEqual(updates.at(-1),["/media/two.webp","/media/one.webp"]);
    await updateAdminDogReport(41,{type:"FOUND",gallery:[]},"fixture");
    assert.deepEqual(updates.at(-1),[]);
  } finally { delete env.DB; delete env.PII_ENCRYPTION_KEY; delete env.PII_HASH_KEY; }
});

test("gallery validation still rejects unsafe URLs before any write", async () => {
  const {updates}=fixture();
  try {
    await assert.rejects(updateAdminDogReport(41,{type:"FOUND",gallery:["javascript:alert(1)"]},"fixture"),/HTTP\/HTTPS/);
    assert.equal(updates.length,0);
  } finally { delete env.DB; delete env.PII_ENCRYPTION_KEY; delete env.PII_HASH_KEY; }
});
