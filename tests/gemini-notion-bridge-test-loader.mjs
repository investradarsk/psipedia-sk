/** Test-only loader: replace just the bridge's lazy Notion transport. */
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "./notion-directory-sync.ts"
    && context.parentURL?.includes("/lib/gemini-automation-notion-bridge.ts?test-notion")) {
    return { url: new URL("./gemini-notion-bridge-test-stub.mjs", import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
