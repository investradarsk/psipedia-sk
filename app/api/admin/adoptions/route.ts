import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { createManagedAdoption, isAdoptionConflict, listManagedAdoptions, type AdoptionInput } from "@/lib/adoption-store";
export const dynamic='force-dynamic';
const errorResponse=(e:unknown)=>Response.json({error:e instanceof Error?e.message:'Nastala neočakávaná chyba.'},{status:isAdoptionConflict(e)?409:400});
export async function GET(request:Request){const user=await getAdminApiUser();if(!user)return unauthorizedAdminResponse();const u=new URL(request.url);return Response.json(await listManagedAdoptions({q:u.searchParams.get('q')??undefined,status:u.searchParams.get('status')??undefined,page:Number(u.searchParams.get('page'))||1}));}
export async function POST(request:Request){const user=await getAdminApiUser();if(!user)return unauthorizedAdminResponse();try{return Response.json({item:await createManagedAdoption(await request.json() as AdoptionInput,user.email)},{status:201});}catch(e){return errorResponse(e)}}
