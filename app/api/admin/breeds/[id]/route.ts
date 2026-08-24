import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { deleteManagedBreed, updateManagedBreed, type ManagedBreedInput } from "@/lib/breed-store";
export const dynamic="force-dynamic";
export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){const user=await getAdminApiUser();if(!user)return unauthorizedAdminResponse();try{const {id}=await params;return Response.json({breed:await updateManagedBreed(Number(id),await request.json() as ManagedBreedInput,user.email)});}catch(error){return Response.json({error:error instanceof Error?error.message:"Plemeno sa nepodarilo uložiť."},{status:400});}}
export async function DELETE(_request:Request,{params}:{params:Promise<{id:string}>}){const user=await getAdminApiUser();if(!user)return unauthorizedAdminResponse();const {id}=await params;await deleteManagedBreed(Number(id));return Response.json({ok:true});}
