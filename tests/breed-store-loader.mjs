import { existsSync } from 'node:fs';
import { resolve as cloudflareResolve } from './cloudflare-loader.mjs';
export async function resolve(specifier,context,nextResolve){
 if(specifier.startsWith('@/'))return {url:new URL('../'+specifier.slice(2)+'.ts',import.meta.url).href,shortCircuit:true};
 if(specifier.startsWith('.')&&context.parentURL?.endsWith('.ts')&&!/\.[a-z]+$/.test(specifier)){
   const candidate=new URL(specifier+'.ts',context.parentURL);if(existsSync(candidate))return {url:candidate.href,shortCircuit:true};
 }
 return cloudflareResolve(specifier,context,nextResolve);
}
