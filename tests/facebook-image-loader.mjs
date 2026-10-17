import {resolve as baseResolve,load} from './admin-events-loader.mjs';
export {load};
export async function resolve(specifier,context,nextResolve){
 if(specifier==='@/components/admin-shell')return {url:'data:text/javascript,'+encodeURIComponent('export function AdminShell({children}){return children;}'),shortCircuit:true};
 if(specifier==='next/navigation')return {url:'data:text/javascript,'+encodeURIComponent('export function redirect(url){throw new Error(url);}'),shortCircuit:true};
 if(specifier==='next/headers')return {url:'data:text/javascript,'+encodeURIComponent('export async function headers(){return globalThis.__FACEBOOK_TEST_HEADERS__??new Headers();} export async function cookies(){return {get(){return undefined;},getAll(){return []}};}'),shortCircuit:true};
 return baseResolve(specifier,context,nextResolve);
}
