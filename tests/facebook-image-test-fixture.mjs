import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {env} from "cloudflare:workers";
const migration=readFileSync(new URL("../drizzle/0128_facebook_image_posts.sql",import.meta.url),"utf8");
export const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOioAAAAASUVORK5CYII=','base64'));
export function fixture(t,withSchema=true){
 const sqlite=new DatabaseSync(':memory:');if(withSchema)sqlite.exec(migration);
 const db={prepare(sql){const stmt=sqlite.prepare(sql);return {values:[],bind(...values){this.values=values;return this;},async first(){return stmt.get(...this.values)??null;},async all(){return {results:stmt.all(...this.values)};},async run(){return {meta:{changes:stmt.run(...this.values).changes}};}};}};
 const images=new Map();const before={DB:env.DB,BUCKET:env.BUCKET,AUTH_MODE:env.AUTH_MODE},headers=globalThis.__FACEBOOK_TEST_HEADERS__;
 env.DB=db;env.AUTH_MODE='local-e2e-preview';env.BUCKET={async put(key,body,meta){images.set(key,{body,...meta});},async head(key){return images.get(key)??null;}};
 globalThis.__FACEBOOK_TEST_HEADERS__=new Headers({host:'localhost:5173'});
 t.after(()=>{Object.assign(env,before);globalThis.__FACEBOOK_TEST_HEADERS__=headers;sqlite.close();});
 return {db,sqlite,images};
}
