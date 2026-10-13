import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && context.parentURL?.startsWith("file:") && !/\.[a-z\d]+$/i.test(specifier)) {
    const url = new URL(specifier + ".ts", context.parentURL);
    if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
