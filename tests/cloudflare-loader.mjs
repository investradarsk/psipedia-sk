import { existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";

const cloudflareWorkersModule = `
  export const env = (globalThis.__CLOUDFLARE_WORKERS_ENV__ ??= {});
  export const waitUntil = (promise) => {
    globalThis.__CLOUDFLARE_WAIT_UNTIL__ = promise;
    promise.catch(() => undefined);
  };
`;

function resolveRepoAlias(specifier) {
  if (!specifier.startsWith("@/")) return null;
  const base = resolvePath(process.cwd(), specifier.slice(2));
  const candidates = [
    base,
    base + ".ts",
    base + ".tsx",
    base + ".js",
    base + ".mjs",
    resolvePath(base, "index.ts"),
    resolvePath(base, "index.tsx"),
    resolvePath(base, "index.js"),
  ];
  const match = candidates.find((candidate) => existsSync(candidate));
  return match ? pathToFileURL(match).href : null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") {
    return {
      url: `data:text/javascript,${encodeURIComponent(cloudflareWorkersModule)}`,
      shortCircuit: true,
    };
  }

  const repoAlias = resolveRepoAlias(specifier);
  if (repoAlias) {
    return {
      url: repoAlias,
      shortCircuit: true,
    };
  }

  return nextResolve(specifier, context);
}
