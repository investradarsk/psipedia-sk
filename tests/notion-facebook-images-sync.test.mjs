import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {
  notionFacebookImageSnapshot,notionFacebookSnapshotFingerprint,
  facebookImagePermalink,
} from "../lib/notion-facebook-images-model.ts";

const future=new Date("2030-01-02T09:00:00.000Z");
const data=(state="Schválené",allow=true,when="2030-01-02T13:30:00+01:00")=>({
  id:"3e0793fc-1d18-8138-8bb7-f0e0a7495728",
  properties:{
    "Názov":{title:[{plain_text:"Náš obrázok"}]},
    "Text na Facebook":{rich_text:[{plain_text:"Samostatný príspevok 🐶"}]},
    "Stav":{status:{name:state}},
    "Povoliť publikovanie":{checkbox:allow},
    "Dátum a čas publikovania":{date:{start:when}},
    "Obrázok":{files:[{id:"file-123",type:"file",file:{
      url:"https://secure.notion-static.com/signed-url?token=one",
    }}]},
  },
});
test("requires two explicit Notion approvals, future datetime and uploaded image",()=>{
  const now=future;
  assert.equal(notionFacebookImageSnapshot(data(),now).ready,true);
  assert.equal(notionFacebookImageSnapshot(data("Koncept",true),now).ready,false);
  assert.equal(notionFacebookImageSnapshot(data("Na kontrolu",true),now).ready,false);
  assert.equal(notionFacebookImageSnapshot(data("Schválené",false),now).ready,false);
  assert.equal(notionFacebookImageSnapshot(data("Naplánované",true),now).ready,true);
  assert.equal(notionFacebookImageSnapshot(data("Schválené",true,"2030-01-01T12:00:00+01:00"),now).ready,false);
  assert.equal(notionFacebookImageSnapshot(data("Schválené",true,"2030-01-02"),now).ready,false);
  assert.equal(notionFacebookImageSnapshot(data("Schválené",true,"2030-01-02T12:00:00"),now).ready,false);
  const noImage=data();noImage.properties["Obrázok"].files=[];
  assert.equal(notionFacebookImageSnapshot(noImage,now).ready,false);
});
test("Notion date with timezone is normalized to UTC, not interpreted as UTC wall-time",()=>{
  assert.equal(notionFacebookImageSnapshot(data(),future).scheduledAt,"2030-01-02T12:30:00.000Z");
});
test("stable Notion file ID prevents signed URL changes from changing the snapshot",()=>{
  const first=data(),second=data();
  second.properties["Obrázok"].files[0].file.url="https://secure.notion-static.com/signed-url?token=two";
  assert.equal(notionFacebookSnapshotFingerprint(notionFacebookImageSnapshot(first,future)),
    notionFacebookSnapshotFingerprint(notionFacebookImageSnapshot(second,future)));
});
test("Facebook permalink generation rejects invalid IDs",()=>{
  assert.equal(facebookImagePermalink("1172082959332114_9988776655"),
    "https://www.facebook.com/1172082959332114/posts/9988776655");
  assert.equal(facebookImagePermalink("9988776655"),
    "https://www.facebook.com/photo.php?fbid=9988776655");
  assert.equal(facebookImagePermalink("../secret"),null);
});
test("integration is isolated, off by default and preserves established Facebook publisher",()=>{
  const importer=readFileSync(new URL("../lib/notion-facebook-images-sync.ts",import.meta.url),"utf8");
  const worker=readFileSync(new URL("../worker/index.ts",import.meta.url),"utf8");
  const migration=readFileSync(new URL("../drizzle/0128_facebook_image_posts.sql",import.meta.url),"utf8");
  assert.match(importer,/2d945afe-0c79-467e-b9e6-6b0f62a27a49/);
  assert.match(importer,/NOTION_FACEBOOK_IMAGES_SYNC_ENABLED/);
  assert.match(importer,/INSERT OR IGNORE INTO facebook_image_posts/);
  assert.match(importer,/a\.post_id=facebook_image_posts\.id/);
  assert.match(importer,/notion_page_id/);
  assert.match(importer,/notionFileIdentity/);
  assert.match(migration,/facebook_image_posts_notion_idx/);
  assert.match(worker,/runNotionFacebookImagesSync/);
  assert.match(worker,/controller\.cron === "\*\/5 \* \* \* \*"/);
  assert.match(worker,/runFacebookImagePublishSweep/);
});
