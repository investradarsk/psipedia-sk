import { env } from "cloudflare:workers";
import { createNewBreedWorkCopy, type BreedWorkCopyBindings } from "@/lib/notion-breed-workcopy-sync";
import { getAdminApiUser, unauthorizedAdminResponse, requireAdminMutation } from "@/lib/admin-auth";
import { createManagedBreed, listManagedBreedSummaries, type ManagedBreedInput } from "@/lib/breed-store";
export const dynamic="force-dynamic";
export async function GET(){const user=await getAdminApiUser();return user?Response.json({breeds:await listManagedBreedSummaries()}):unauthorizedAdminResponse();}
export async function POST(request:Request){const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response || !auth.user) return auth.response ?? unauthorizedAdminResponse();
  const user = auth.user;try{
    const breed=await createManagedBreed(await request.json() as ManagedBreedInput,user.email);
    const bindings=env as unknown as BreedWorkCopyBindings & {DB?:D1Database};
    let notionCreation:"synced"|"pending"|undefined;
    if(breed&&bindings.DB&&bindings.NOTION_PROFILE_AUTHORITY_MODE==="validated-text"){
      try{await createNewBreedWorkCopy({database:bindings.DB,bindings,entityId:breed.id});notionCreation="synced";}
      catch(error){notionCreation="pending";console.warn("BREED_FIRST_COPY_PENDING",{id:breed.id,code:error instanceof Error?error.message:"UNKNOWN"});}
    }
    return Response.json({breed,notionCreation},{status:201});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"Plemeno sa nepodarilo uložiť."},{status:400});}}
