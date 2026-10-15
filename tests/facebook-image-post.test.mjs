import assert from 'node:assert/strict';
import test from 'node:test';
import {facebookScheduleInstant,facebookWallTime,normalizeFacebookImageInput,facebookPostsForDay} from '../lib/facebook-image-post.ts';
import {saveFacebookImagePost,listFacebookImagePosts,getFacebookImagePost,FacebookImageConflict,FacebookImageSchemaUnavailable} from '../lib/facebook-image-store.ts';
import {POST,GET} from '../app/api/admin/facebook-images/route.ts';
import {PUT,GET as detail} from '../app/api/admin/facebook-images/[id]/route.ts';
import {POST as upload} from '../app/api/admin/uploads/route.ts';
import {fixture,png} from './facebook-image-test-fixture.mjs';
const input=(more={})=>({title:'Ručný príspevok',caption:'Text na Facebook',imageUrl:'',imageKey:'',date:'',time:'',status:'draft',...more});
const request=(url,body,method='POST',headers={})=>new Request('http://localhost:5173'+url,{method,headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
const uploadRequest=()=>new Request('http://localhost:5173/api/admin/uploads',{method:'POST',headers:{'content-type':'image/png','x-upload-folder':'facebook-images'},body:png});

test('Bratislava schedule roundtrips independent of browser/server timezone; no slot restrictions',()=>{
 for(const [date,time,utc] of [['2026-01-01','00:01','2025-12-31T23:01:00.000Z'],['2026-07-01','23:59','2026-07-01T21:59:00.000Z'],['2020-06-01','03:07','2020-06-01T01:07:00.000Z']]){
  assert.equal(facebookScheduleInstant(date,time),utc);assert.deepEqual(facebookWallTime(utc),{date,time});
 }
 assert.throws(()=>facebookScheduleInstant('2026-02-30','12:00'));
 assert.throws(()=>facebookScheduleInstant('2026-03-29','02:30'),/neexistuje/);
 assert.throws(()=>facebookScheduleInstant('2026-10-25','02:30'),/opakuje/);
 assert.equal(facebookScheduleInstant('2026-10-25','02:30','earlier'),'2026-10-25T00:30:00.000Z');
 assert.equal(facebookScheduleInstant('2026-10-25','02:30','later'),'2026-10-25T01:30:00.000Z');
});
test('draft creation, full values reload, update, cancellation and stable UUID with monotonic CAS',async t=>{
 const{db}=fixture(t);const first=await saveFacebookImagePost(null,input(),'admin',db);
 assert.match(first.id,/^[a-f0-9-]{36}$/);assert.equal(first.version,1);assert.equal(first.status,'draft');
 const next=await saveFacebookImagePost(first.id,input({title:'Nový názov',caption:'Uložený text',expectedVersion:first.version}),'admin',db);
 assert.equal(next.id,first.id);assert.equal(next.version,2);assert.equal((await getFacebookImagePost(first.id,db)).caption,'Uložený text');
 await assert.rejects(saveFacebookImagePost(first.id,input({expectedVersion:1}),'admin',db),FacebookImageConflict);
 const race=await Promise.allSettled([saveFacebookImagePost(first.id,input({expectedVersion:2}),'a',db),saveFacebookImagePost(first.id,input({expectedVersion:2}),'b',db)]);
 assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.equal(race.filter(r=>r.status==='rejected'&&r.reason instanceof FacebookImageConflict).length,1);
});
test('real upload, replacement and overlapping schedules persist without publish side effects',async t=>{
 const{db,images,sqlite}=fixture(t);t.mock.method(globalThis,'fetch',()=>{throw new Error('External publish/network is forbidden');});const firstUpload=await upload(uploadRequest());assert.equal(firstUpload.status,201);const image=await firstUpload.json();
 const post=await saveFacebookImagePost(null,input({imageUrl:image.imageUrl,imageKey:image.imageKey,date:'2026-10-25',time:'02:30',repeatedHour:'later',status:'scheduled'}),'admin',db);
 const secondImage=await (await upload(uploadRequest())).json();
 const second=await saveFacebookImagePost(null,input({imageUrl:secondImage.imageUrl,imageKey:secondImage.imageKey,date:'2026-10-25',time:'02:30',repeatedHour:'later',status:'scheduled'}),'admin',db);
 assert.equal(post.scheduledAt,second.scheduledAt);
 const updated=await saveFacebookImagePost(post.id,input({imageUrl:secondImage.imageUrl,imageKey:secondImage.imageKey,expectedVersion:1}),'admin',db);
 assert.equal(updated.imageKey,secondImage.imageKey);assert.ok(images.has(image.imageKey));assert.equal(updated.status,'draft');assert.equal(updated.scheduledAt,null);
 const data=await listFacebookImagePosts('2026-10','all',1,db);assert.equal(data.total,2);assert.equal(facebookPostsForDay(data.calendar,'2026-10-25').length,1);
 const row=sqlite.prepare('SELECT facebook_post_id,published_at,approval_status,notion_page_id FROM facebook_image_posts WHERE id=?').get(post.id);
 assert.deepEqual({...row},{facebook_post_id:null,published_at:null,approval_status:'UNREVIEWED',notion_page_id:null});
});
test('drafts with a date appear in calendar; arbitrary same-time entries and paging are retained',async t=>{
 const{db}=fixture(t);for(let i=0;i<52;i++)await saveFacebookImagePost(null,input({date:'2026-10-15',time:'03:07'}),'admin',db);
 const data=await listFacebookImagePosts('2026-10','draft',2,db);assert.equal(data.items.length,2);assert.equal(data.total,52);assert.equal(facebookPostsForDay(data.calendar,'2026-10-15').length,52);
});
test('API auth and same-origin gates reject requests before writes',async t=>{
 const{sqlite}=fixture(t);globalThis.__FACEBOOK_TEST_HEADERS__=new Headers();
 assert.equal((await POST(request('/api/admin/facebook-images',input()))).status,401);
 assert.equal((await GET(new Request('http://localhost/api/admin/facebook-images'))).status,401);
 assert.equal((await detail(new Request('http://localhost'),{params:Promise.resolve({id:'missing'})})).status,401);
 assert.equal((await PUT(request('/api/admin/facebook-images/a',input(),'PUT'),{params:Promise.resolve({id:'a'})})).status,401);
 assert.equal((await upload(uploadRequest())).status,401);
 globalThis.__FACEBOOK_TEST_HEADERS__=new Headers({host:'localhost:5173'});
 assert.equal((await POST(request('/api/admin/facebook-images',input(),'POST',{origin:'https://evil.example'}))).status,403);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM facebook_image_posts').get().n,0);
});
test('schema absent fails closed for reads, creates and upload without R2 mutation',async t=>{
 const{db,images}=fixture(t,false);await assert.rejects(saveFacebookImagePost(null,input(),'admin',db),FacebookImageSchemaUnavailable);
 assert.equal((await POST(request('/api/admin/facebook-images',input()))).status,503);
 assert.equal((await GET(new Request('http://localhost/api/admin/facebook-images'))).status,503);
 assert.equal((await upload(uploadRequest())).status,503);assert.equal(images.size,0);
});
test('uploaded type, magic bytes, size and R2 existence are validated',async t=>{
 const{db}=fixture(t);
 assert.equal((await upload(new Request('http://localhost/api/admin/uploads',{method:'POST',headers:{'content-type':'image/png','x-upload-folder':'facebook-images','content-length':String(9*1024*1024)},body:png}))).status,413);
 assert.equal((await upload(new Request('http://localhost/api/admin/uploads',{method:'POST',headers:{'content-type':'image/jpeg','x-upload-folder':'facebook-images'},body:png}))).status,415);
 assert.equal((await upload(new Request('http://localhost/api/admin/uploads',{method:'POST',headers:{'content-type':'image/avif','x-upload-folder':'facebook-images'},body:png}))).status,415);
 await assert.rejects(saveFacebookImagePost(null,input({imageKey:'facebook-images/2026/aaaa.png',imageUrl:'/media/facebook-images/2026/aaaa.png'}),'admin',db),/nenašiel/);
 assert.throws(()=>normalizeFacebookImageInput(input({imageUrl:'https://notion.so/temp',imageKey:'bad'})));
});
test('API GET reload and PUT conflict retain newer data; immutable publish metadata cannot be injected',async t=>{
 fixture(t);const created=await (await POST(request('/api/admin/facebook-images',input()))).json();const id=created.post.id,params=Promise.resolve({id});
 const changed=await PUT(request('/api/admin/facebook-images/'+id,input({title:'Novšie',expectedVersion:1}),'PUT'),{params});assert.equal(changed.status,200);
 const conflict=await PUT(request('/api/admin/facebook-images/'+id,input({title:'Staré',expectedVersion:1}),'PUT'),{params});assert.equal(conflict.status,409);
 const reloaded=await (await detail(new Request('http://localhost'),{params})).json();assert.equal(reloaded.post.title,'Novšie');
 assert.equal((await POST(request('/api/admin/facebook-images',input({facebook_post_id:'fake'})))).status,400);
 assert.equal((await POST(request('/api/admin/facebook-images',input({status:'published'})))).status,400);
});
test('missing migration renders a safe disabled admin page; legacy article upload still works',async t=>{
 const{images}=fixture(t,false);
 const {default:Page}=await import('../app/admin/facebook-obrazky/page.tsx');
 const {renderToStaticMarkup}=await import('react-dom/server');const html=renderToStaticMarkup(await Page());
 assert.match(html,/0128/);assert.match(html,/disabled=""/);assert.doesNotMatch(html,/<form/);
 const legacy=await upload(new Request('http://localhost/api/admin/uploads',{method:'POST',headers:{'content-type':'image/png','x-upload-folder':'articles'},body:png}));assert.equal(legacy.status,201);assert.equal(images.size,1);
});
test('prepared SQL and Drizzle agree; migration adds only its own table and indexes',async t=>{
 const{sqlite}=fixture(t);const {getTableConfig}=await import('drizzle-orm/sqlite-core');const{facebookImagePosts}=await import('../db/facebook-image-schema.ts');
 const columns=sqlite.prepare('PRAGMA table_info(facebook_image_posts)').all();const config=getTableConfig(facebookImagePosts);
 assert.deepEqual(columns.map(c=>c.name),config.columns.map(c=>c.name));
 for(const column of config.columns){const sql=columns.find(c=>c.name===column.name);assert.equal(sql.type.toLowerCase(),column.getSQLType());assert.equal(Boolean(sql.notnull),column.notNull);}
 const indexes=sqlite.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);
 assert.deepEqual(indexes,['facebook_image_posts_notion_idx','facebook_image_posts_schedule_idx','facebook_image_posts_updated_idx']);
});
