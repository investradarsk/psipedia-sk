// Isolated browser regression; no application server, D1, R2 or external uploads.
// Run: node tests/admin-photo-gallery.browser.mjs
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";
const bundle = await build({
  stdin: {contents: `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{AdminPhotoGallery}from'./components/admin-photo-gallery';function App(){const[v,setV]=useState(['/media/one.webp','/media/two.webp']);const[b,setB]=useState(false);return <><AdminPhotoGallery value={v} onChange={setV} folder="lost-found" limit={4} onBusyChange={setB}/><output id="value" hidden>{JSON.stringify(v)}</output><button id="save" disabled={b}>Uložiť</button></>}createRoot(document.getElementById('root')).render(<App/>);`, resolveDir:process.cwd(), loader:"tsx"},
  bundle:true, write:false, outdir:"/tmp/psipedia-gallery-browser", jsx:"automatic", define:{"process.env.NODE_ENV":'"production"'},
});
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage({viewport:{width:320,height:800}});
  const uploads=[];
  await page.route("http://gallery.test/**",async route=>{
    const request=route.request();
    if(request.url().endsWith('/api/admin/uploads')){
      uploads.push(request.headers()['x-upload-folder']);
      const name=decodeURIComponent(request.headers()['x-file-name']);
      if(name==='fail.png')return route.fulfill({status:400,json:{error:'Testované zlyhanie'}});
      if(name==='last.png')await new Promise(resolve=>setTimeout(resolve,500));
      return route.fulfill({status:200,json:{imageUrl:'/media/'+name,imageKey:name}});
    }
    if(request.resourceType()==='document') return route.fulfill({contentType:'text/html',body:'<div id="root"></div>'});
    return route.fulfill({status:404,body:''});
  });
  await page.goto('http://gallery.test/');
  for(const output of bundle.outputFiles) {
    if(output.path.endsWith('.css'))await page.addStyleTag({content:output.text});
    else if(output.path.endsWith('.js'))await page.addScriptTag({content:output.text});
  }
  const values=async()=>JSON.parse(await page.locator('#value').textContent());
  await page.getByRole('button',{name:'Posunúť fotografiu 2 dopredu',exact:true}).click();
  assert.deepEqual(await values(),['/media/two.webp','/media/one.webp']);
  await page.getByRole('button',{name:'Odstrániť fotografiu 1 z galérie'}).click();
  assert.deepEqual(await values(),['/media/one.webp']);
  const input=page.getByLabel('Pridať fotografiu z URL');
  await input.fill('javascript:alert(1)');await input.press('Enter');
  assert.match(await page.getByRole('alert').textContent(),/platnú/);
  assert.deepEqual(await values(),['/media/one.webp']);
  await input.fill('/media/three.webp');await input.press('Enter');
  assert.deepEqual(await values(),['/media/one.webp','/media/three.webp']);
  // Uppy Dashboard replaces the old single file input. Use the visible
  // action and the actual standard (non-folder) picker in its modal.
  const openUppy=async()=>{
    await page.getByRole('button',{name:'Nahrať fotografie',exact:true}).click();
    await page.locator('.uppy-Dashboard-input:not([webkitdirectory])').waitFor({state:'attached'});
  };
  const chooseFiles=async(files)=>{
    await page.locator('.uppy-Dashboard-input:not([webkitdirectory])').setInputFiles(files);
  };
  await openUppy();
  // One successful upload must survive a later failure in the same batch.
  await chooseFiles([
    {name:'ok.png',mimeType:'image/png',buffer:Buffer.from('fixture')},
    {name:'fail.png',mimeType:'image/png',buffer:Buffer.from('fixture')},
  ]);
  await page.locator('.uppy-StatusBar-actionBtn--upload').click();
  await page.getByRole('alert').filter({hasText:'Testované zlyhanie'}).waitFor();
  assert.deepEqual(await values(),['/media/one.webp','/media/three.webp','/media/ok.png']);
  assert.deepEqual(uploads,['lost-found','lost-found']);
  assert.equal(await page.locator('#save').isEnabled(),true);
  await page.locator('.uppy-Dashboard-close').click();
  await openUppy();
  // With one remaining slot Uppy switches to a native single-file picker,
  // so the browser prevents selecting two files in the first place.
  assert.equal(await page.locator('.uppy-Dashboard-input:not([webkitdirectory])').getAttribute('multiple'), null);
  assert.equal(uploads.length,2);
  // Exercise the real Dashboard upload click after retry/error state.
  // The authenticated request is delayed so the visible busy state can be
  // inspected; a successful batch must close the modal and update the owner.
  await chooseFiles([{name:'last.png',mimeType:'image/png',buffer:Buffer.from('fixture')}]);
  await page.locator('.uppy-StatusBar-actionBtn--upload').click();
  await page.waitForFunction(()=>document.querySelector('#save')?.hasAttribute('disabled'));
  await page.waitForFunction(()=>JSON.parse(document.querySelector('#value').textContent).includes('/media/last.png'));
  await page.locator('.uppy-Dashboard-Modal').waitFor({state:'hidden'});
  assert.deepEqual(await values(),['/media/one.webp','/media/three.webp','/media/ok.png','/media/last.png']);
  assert.deepEqual(uploads,['lost-found','lost-found','lost-found']);
  assert.equal(await page.locator('#save').isEnabled(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  console.log('PASS Uppy gallery: reorder, URL validation, preview, partial failure, upload click, visible busy, modal close, capacity, folder, 320px');
} finally { await browser.close(); }
