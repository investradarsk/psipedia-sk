import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import ts from "typescript";

const src=ts.createSourceFile("component.tsx",readFileSync("components/admin-article-block-editor.tsx","utf8"),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let handler;
function walk(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==="uploadGallery")handler=node.getText(src);ts.forEachChild(node,walk);}
walk(src);
assert.ok(handler,"Real article upload handler must be tested");
const code=ts.transpileModule(handler,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
function fixture({images=[],pending=false,upload}={}){
  let blocks=[{id:"gallery",type:"gallery",images}];
  const lock={current:pending};
  let busy=false,message="",error="";
  const update=(id,modify)=>{blocks=blocks.map(block=>block.id===id?modify(block):block);};
  const run=new Function("blocks","galleryUploadPending","onUploadingChange","onError","onMessage","uploadAdminImage","update",code+"; return uploadGallery;")(
    blocks,lock,v=>{busy=v;},v=>{error=v;},v=>{message=v;},upload,update
  );
  return {run,read:()=>({images:blocks[0].images,busy,message,error,pending:lock.current})};
}
const image=(name)=>({name});

test("gallery keeps successful images when an upload in the middle fails",async()=>{
  const calls=[];
  const original={url:"/media/old.webp",alt:"Existing",caption:"Caption",credit:"Credit",size:"wide"};
  const f=fixture({images:[original],upload:async(file,folder)=>{calls.push([file.name,folder]);if(file.name==="bad.webp")throw new Error("Broken file");return {imageUrl:"/media/"+file.name,imageKey:file.name};}});
  await f.run([image("a.webp"),image("bad.webp"),image("c.webp")],"gallery");
  assert.deepEqual(calls,[["a.webp","articles"],["bad.webp","articles"],["c.webp","articles"]]);
  assert.deepEqual(f.read().images.map(x=>x.url),["/media/old.webp","/media/a.webp","/media/c.webp"]);
  assert.deepEqual(f.read().images[0],original);
  assert.match(f.read().error,/bad.webp: Broken file/);
  assert.match(f.read().message,/2 obrázkov/);
  assert.equal(f.read().pending,false);
  assert.equal(f.read().busy,false);
});

test("gallery checks available capacity before uploading and never truncates silently",async()=>{
  let calls=0;
  const f=fixture({images:Array(23).fill({url:"/media/old.webp"}),upload:async()=>{calls++;return {imageUrl:"/media/x.webp"};}});
  await f.run([image("one.webp"),image("two.webp")],"gallery");
  assert.equal(calls,0);
  assert.match(f.read().error,/najviac 1/);
  assert.equal(f.read().images.length,23);
});

test("gallery blocks concurrent batches while upload is in progress",async()=>{
  let calls=0;
  const f=fixture({pending:true,upload:async()=>{calls++;}});
  await f.run([image("one.webp")],"gallery");
  assert.equal(calls,0);
});

test("existing file inputs still clear the selection",async()=>{
  const f=fixture({upload:async file=>({imageUrl:"/media/"+file.name,imageKey:file.name})});
  const event={target:{files:[image("one.webp")],value:"chosen"}};
  await f.run(event,"gallery");
  assert.equal(event.target.value,"");
  assert.equal(f.read().images.length,1);
});
