import { env } from 'cloudflare:workers';
import { getAdminApiUser, unauthorizedAdminResponse } from '@/lib/admin-auth';
import { auditPublishedBreeds } from '@/lib/breed-audit';
export const dynamic='force-dynamic';
export async function GET(){
  if(!await getAdminApiUser())return unauthorizedAdminResponse();
  return Response.json(await auditPublishedBreeds(env.DB,env),{headers:{'cache-control':'no-store'}});
}
