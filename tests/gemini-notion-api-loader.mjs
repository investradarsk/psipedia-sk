import { resolve as baseResolve, load } from './admin-events-loader.mjs';
export { load };
export async function resolve(specifier, context, nextResolve) {
  if (specifier === '@/lib/admin-auth') return {
    url: 'data:text/javascript,' + encodeURIComponent(`
      export async function getAdminApiUser() { return null; }
      export function unauthorizedAdminResponse() { return Response.json({ error: 'Unauthorized' }, { status: 401 }); }
      export async function requireAdminMutation() { return { response: unauthorizedAdminResponse(), user: null }; }
    `), shortCircuit: true,
  };
  return baseResolve(specifier, context, nextResolve);
}
