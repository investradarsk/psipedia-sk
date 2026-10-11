// Disposable visual harness: actual production components, no database or app routes.
import { build } from 'esbuild';
import { mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, extname } from 'node:path';
const output=resolve('outputs/redesign4');mkdirSync(output,{recursive:true});
await build({entryPoints:['tests/helpers/events-fallback-preview.tsx'],bundle:true,outfile:output+'/preview.js',format:'esm',jsx:'automatic',loader:{'.css':'css'},conditions:['style'],plugins:[{name:'css-modules',setup(builder){builder.onLoad({filter:/\.module\.css$/},args=>({contents:readFileSync(args.path,'utf8'),loader:'local-css'}));}}],alias:{'@':resolve('.'),'next/link':resolve('tests/helpers/events-preview-link.tsx'),'next/navigation':resolve('tests/helpers/events-preview-navigation.ts')},define:{'process.env.NODE_ENV':'"test"'},logLevel:'warning'});
const server=createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/') {res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="sk"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Podujatia – vizuálna kontrola</title><link rel="stylesheet" href="/preview.css"><body><div id="root"></div><script type="module" src="/preview.js"></script></body></html>');return;}
  const root=pathname.startsWith('/preview.')?output:resolve('public');
  const path=resolve(root,'.'+pathname);
  if(!path.startsWith(root+'/')){res.writeHead(403).end();return;}
  try{const bytes=readFileSync(path);res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.webp':'image/webp'})[extname(path)]||'application/octet-stream');res.end(bytes);}catch{res.writeHead(404).end();}
});server.listen(5174,'127.0.0.1',()=>console.log('Event component preview ready at http://127.0.0.1:5174'));
