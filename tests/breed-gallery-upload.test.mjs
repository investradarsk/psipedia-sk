import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

// Execute the actual component handler with deterministic upload/state adapters.
const source = ts.createSourceFile('editor.tsx',readFileSync('components/admin-breed-editor.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let handler;
function visit(node) { if(ts.isFunctionDeclaration(node) && node.name?.text==='uploadGallery')handler=node.getText(source); ts.forEachChild(node,visit); }
visit(source);
assert.ok(handler);
const code=ts.transpileModule(handler,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
function fixture({gallery=[],saving=false,pending=false,upload}={}) {
  let form={name:'Testovacie plemeno',gallery};
  let error='',message='',busy=false;
  const lock={current:pending};
  const run=new Function('uploadAdminImage','setUploading','setError','setMessage','setForm','form','uploadPending','saving',code+'; return uploadGallery;')(
    upload, v=>{busy=v;},v=>{error=v;},v=>{message=v;},fn=>{form=fn(form);},form,lock,saving,
  );
  return {run,read:()=>({form,error,message,busy,lock:lock.current})};
}
const event=(names)=>({target:{files:names.map(name=>({name})),value:'selected'}});

test('successful files survive a failed middle file and remaining files are attempted',async()=>{
  const calls=[];
  const original={imageUrl:'/media/original.webp',alt:'Pôvodný alt',caption:'Popis',credit:'Autor'};
  const f=fixture({gallery:[original],upload:async(file,folder)=>{calls.push([file.name,folder]);if(file.name==='bad.png')throw Error('Invalid image');return{imageUrl:'/media/'+file.name,imageKey:file.name};}});
  const e=event(['one.png','bad.png','three.png']);await f.run(e);
  assert.deepEqual(calls,[['one.png','breeds'],['bad.png','breeds'],['three.png','breeds']]);
  assert.deepEqual(f.read().form.gallery.map(x=>x.imageUrl),['/media/original.webp','/media/one.png','/media/three.png']);
  assert.deepEqual(f.read().form.gallery[0],original);
  assert.match(f.read().error,/bad.png: Invalid image/);
  assert.match(f.read().message,/2 fotografií/);
  assert.equal(f.read().busy,false);assert.equal(f.read().lock,false);assert.equal(e.target.value,'');
});
test('capacity is checked before uploading instead of silently truncating at server save',async()=>{
  let calls=0;const f=fixture({gallery:Array(29).fill({imageUrl:'/media/old.webp'}),upload:async()=>{calls++;}});
  await f.run(event(['one.png','two.png']));assert.equal(calls,0);assert.match(f.read().error,/najviac 1/);assert.equal(f.read().form.gallery.length,29);
});
test('in-flight upload or save blocks a second batch',async()=>{
  for(const config of [{saving:true},{pending:true}]){let calls=0;const f=fixture({...config,upload:async()=>{calls++;}});await f.run(event(['one.png']));assert.equal(calls,0);}
});
test('all failed files leave existing gallery intact and release the upload lock',async()=>{
  const f=fixture({gallery:[{imageUrl:'/media/old.webp'}],upload:async()=>{throw Error('Offline');}});
  await f.run(event(['one.png']));assert.equal(f.read().form.gallery.length,1);assert.equal(f.read().busy,false);assert.equal(f.read().lock,false);assert.match(f.read().error,/Offline/);
});
