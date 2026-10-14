import { resolve as standardResolve, load } from "./admin-events-loader.mjs";
const mockedImports = new Set([
  "@/lib/geo-store", "@/lib/google-place-target-discovery", "@/lib/directory-store",
  "@/lib/event-store", "@/lib/admin-address-adapters", "@/lib/admin-google-address-preview",
  "@/lib/organization-location-admin-write",
]);
export async function resolve(specifier, context, nextResolve) {
  if (context.parentURL?.includes("/app/api/admin/geo/") && context.parentURL?.endsWith("/route.ts")
      && specifier.startsWith("@/") && specifier !== "@/lib/admin-google-place-confirmation") {
    return { url: new URL("./google-confirmation-harness.mjs", import.meta.url).href, shortCircuit: true };
  }
  if (context.parentURL?.endsWith("/lib/admin-google-place-confirmation.ts") && mockedImports.has(specifier)) {
    return { url: new URL("./google-confirmation-harness.mjs", import.meta.url).href, shortCircuit: true };
  }
  return standardResolve(specifier, context, nextResolve);
}
export { load };
