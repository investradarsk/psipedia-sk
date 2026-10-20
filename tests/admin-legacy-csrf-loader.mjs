import { existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";

// Offline-only mocks. Production code does not import this loader.
const mocked = {
  "cloudflare:workers": 'export const env = { ADMIN_EMAILS: "admin@example.com" };',
  "next/headers": 'export async function headers() { return new Headers({host: "psipedia.sk"}); }',
  "next/navigation": 'export function redirect() { throw new Error("Unexpected redirect"); }',
  "@/app/chatgpt-auth": 'export async function getChatGPTUser() { return globalThis.__csrfTestIdentity ?? null; } export async function requireChatGPTUser() { return getChatGPTUser(); }',
  "@/lib/article-topics": 'export async function listArticleTopics() { return []; } export async function createArticleTopic() { globalThis.__csrfTestTopicWrites = (globalThis.__csrfTestTopicWrites ?? 0) + 1; return {created:true,topic:{id:1}}; } export function isArticleTopicConflict() { return false; }',
};
export async function resolve(specifier, context, nextResolve) {
  if (Object.hasOwn(mocked, specifier)) {
    return { url: "data:text/javascript," + encodeURIComponent(mocked[specifier]), shortCircuit: true };
  }
  if (specifier.startsWith("@/")) {
    const base = resolvePath(process.cwd(), specifier.slice(2));
    for (const path of [base, base + ".ts", base + ".mjs", base + ".js"]) {
      if (existsSync(path)) return { url: pathToFileURL(path).href, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}
