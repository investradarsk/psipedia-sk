import test from "node:test";
import assert from "node:assert/strict";
import {env} from "cloudflare:workers";
import {fixture} from "./facebook-image-test-fixture.mjs";
import {isFacebookVideoKey,isFacebookPhotoKey,facebookVideoMime} from "../lib/facebook-video.ts";
import {normalizeFacebookImageInput} from "../lib/facebook-image-post.ts";
import {saveFacebookImagePost} from "../lib/facebook-image-store.ts";
import {POST as uploadVideo} from "../app/api/admin/facebook-images/video-upload/route.ts";
import {publishVideoToMeta,videoPublisherConfigured,setPublisherEnabled,runFacebookImagePublishSweep} from "../lib/facebook-image-publisher.ts";
import {shouldExportAdminImage} from "../lib/notion-facebook-images-admin-export.ts";

const key="facebook-images/2030/aaaaaaaa-1234-4567-890a-abcdefabcdef.mp4";
const input=(value={})=>({title:"Video",imageKey:key,imageUrl:"/media/"+key,
 caption:"Video o psoch",date:"2030-01-09",time:"12:00",status:"scheduled",...value});
const bindings={FB_PAGE_ID:"123456789012345",
 FB_PAGE_ACCESS_TOKEN:"FAKE_VIDEO_TEST_TOKEN_NOT_REAL_123456",
 FACEBOOK_IMAGE_PUBLISH_ENABLED:"true"};

test("video identity is explicit; legacy image keys and mismatched paths remain safe",()=>{
 assert.equal(isFacebookVideoKey(key),true);
 assert.equal(isFacebookPhotoKey(key),false);
 assert.equal(facebookVideoMime(key),"video/mp4");
 assert.equal(facebookVideoMime(key.replace(".mp4",".mov")),"video/quicktime");
 assert.equal(isFacebookVideoKey("articles/2026/video.mp4"),false);
 assert.equal(normalizeFacebookImageInput(input()).imageKey,key);
 assert.throws(()=>normalizeFacebookImageInput(input({imageUrl:"https://bad.example/video.mp4"})));
 assert.throws(()=>normalizeFacebookImageInput(input({imageKey:key.replace(".mp4",".avi")})));
 assert.equal(isFacebookPhotoKey(key.replace(".mp4",".jpg")),true);
});

test("video upload is authenticated, checks content signature, and stores R2 under the canonical key",async t=>{
 const {db,images}=fixture(t);
 const mp4=Uint8Array.from([0,0,0,24,102,116,121,112,105,115,111,109,0,0,0,0,105,115,111,109,0,0,0,0]);
 const make=(mime,body=mp4,headers={})=>new Request("http://localhost:5173/api/admin/facebook-images/video-upload",{
   method:"POST",headers:{"content-type":mime,...headers},body});
 assert.equal((await uploadVideo(make("image/png"))).status,415);
 assert.equal((await uploadVideo(make("video/quicktime"))).status,415);
 assert.equal((await uploadVideo(make("video/mp4",mp4,{"content-length":String(51*1024*1024)}))).status,413);
 const uploaded=await uploadVideo(make("video/mp4"));
 assert.equal(uploaded.status,201);
 const item=await uploaded.json();
 assert.match(item.imageKey,/^facebook-images\/\d{4}\/[a-f0-9-]+\.mp4$/);
 assert.equal(item.imageUrl,"/media/"+item.imageKey);
 assert.equal(images.get(item.imageKey).httpMetadata.contentType,"video/mp4");
 const stored=await saveFacebookImagePost(null,input({imageKey:item.imageKey,imageUrl:item.imageUrl}),"admin",db);
 assert.equal(stored.status,"scheduled");
 assert.equal(stored.imageKey,item.imageKey);
 assert.equal(shouldExportAdminImage({
   image_key:item.imageKey,updated_by:"admin",sync_hash:null,version:1
 },Date.now()),false);
});

test("video Meta publisher is separately opt-in and posts to the Page video edge",async()=>{
 assert.equal(videoPublisherConfigured(bindings),false);
 await assert.rejects(publishVideoToMeta({imageKey:key,caption:"Video"},bindings,async()=>{throw Error("called");}),/FACEBOOK_VIDEO_NOT_CONFIGURED/);
 const calls=[];
 const fetcher=async(url,opts)=>{calls.push({url,opts});return Response.json({id:"99887766554433"});};
 const enabled={...bindings,FACEBOOK_VIDEO_PUBLISH_ENABLED:"true"};
 const id=await publishVideoToMeta({imageKey:key,caption:"Nové video"},enabled,fetcher);
 assert.equal(id,"99887766554433");
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,"https://graph-video.facebook.com/v26.0/123456789012345/videos");
 assert.equal(new URLSearchParams(calls[0].opts.body).get("file_url"),"https://psipedia.sk/media/"+key);
 assert.equal(new URLSearchParams(calls[0].opts.body).get("description"),"Nové video");
 assert.equal(calls[0].url.includes(bindings.FB_PAGE_ACCESS_TOKEN),false);
});

test("a scheduled video is never claimed when video publishing is OFF",async t=>{
 const {sqlite,db}=fixture(t);
 const now="2030-01-10T00:00:00.000Z";
 const id="00000000-0000-4000-8000-000000000789";
 sqlite.prepare("INSERT INTO facebook_image_posts(id,title,image_url,image_key,caption,scheduled_at,status,approval_status,approved_at,approved_by,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
   .run(id,"Video","/media/"+key,key,"Popis","2030-01-09T23:59:00.000Z","scheduled","APPROVED",now,"admin",now,now,"admin","admin");
 await setPublisherEnabled(db,true,"admin");
 const calls=[];
 const fetcher=async(url,opts)=>{calls.push(url);return Response.json({id:"99887766554433"});};
 const head=async()=>({httpMetadata:{contentType:"video/mp4"}});
 const videoBindings={...bindings,BUCKET:{head},FACEBOOK_IMAGE_SAFE_RETRY_V2_ENABLED:"true"};
 const blocked=await runFacebookImagePublishSweep({db,bindings:videoBindings,now:new Date(now),fetcher});
 assert.equal(blocked.claimed,0);
 assert.equal(calls.length,0);
 assert.equal(sqlite.prepare("SELECT COUNT(*) AS total FROM facebook_image_publish_attempts").get().total,0);
 const sent=await runFacebookImagePublishSweep({db,bindings:{...videoBindings,FACEBOOK_VIDEO_PUBLISH_ENABLED:"true"},now:new Date(now),fetcher});
 assert.equal(sent.published,1);
 assert.equal(calls.length,1);
 assert.equal(calls[0],"https://graph-video.facebook.com/v26.0/123456789012345/videos");
 assert.equal(sqlite.prepare("SELECT status FROM facebook_image_posts WHERE id=?").get(id).status,"published");
 assert.equal((await runFacebookImagePublishSweep({db,bindings:{...videoBindings,FACEBOOK_VIDEO_PUBLISH_ENABLED:"true"},now:new Date(now),fetcher})).claimed,0);
});
