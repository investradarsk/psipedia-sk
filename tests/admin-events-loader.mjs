import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { resolve as cloudflareResolve } from './cloudflare-loader.mjs';
export async function resolve(specifier, context, nextResolve) {
  let url;
  if (specifier.startsWith('@/')) url = new URL('../' + specifier.slice(2), import.meta.url);
  else if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) url = new URL(specifier, context.parentURL);
  if (url && !/\.[a-z]+$/.test(url.pathname)) for (const extension of ['.ts', '.tsx']) {
    const path = fileURLToPath(url) + extension;
    if (existsSync(path)) return { url: pathToFileURL(path).href, shortCircuit: true };
  }
  return cloudflareResolve(specifier, context, nextResolve);
}
export async function load(url, context, nextLoad) {
  if (url.endsWith('.tsx')) return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText };
  return nextLoad(url, context);
}
