import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { createManagedBreed, listManagedBreedSummaries, type ManagedBreedInput } from "@/lib/breed-store";
export const dynamic="force-dynamic";
export async function GET(){const user=await getAdminApiUser();return user?Response.json({breeds:await listManagedBreedSummaries()}):unauthorizedAdminResponse();}
export async function POST(request:Request){const user=await getAdminApiUser();if(!user)return unauthorizedAdminResponse();try{return Response.json({breed:await createManagedBreed(await request.json() as ManagedBreedInput,user.email)},{status:201});}catch(error){return Response.json({error:error instanceof Error?error.message:"Plemeno sa nepodarilo uložiť."},{status:400});}}
