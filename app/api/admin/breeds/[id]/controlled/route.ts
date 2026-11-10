import { env } from "cloudflare:workers";
import { getAdminApiUser, requireAdminMutation, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { getManagedBreed } from "@/lib/breed-store";
import {
  getBreedControlledState, saveBreedControlledFromAdmin,
  type ControlledBreedBindings,
} from "@/lib/notion-breed-workcopy-controlled";

export const dynamic="force-dynamic";
type Props={params:Promise<{id:string}>};
type Bindings=ControlledBreedBindings & {DB?:D1Database};
async function context(params:Props["params"]) {
  const raw=(await params).id;
  const id=Number(raw);
  if (!Number.isSafeInteger(id) || id<1 || String(id)!==raw) return null;
  return id;
}
function failed(error:unknown) {
  const code=error instanceof Error?error.message:"BREED_CONTROLLED_UNAVAILABLE";
  const conflict=code.endsWith("_EDIT_CONFLICT") || code.endsWith("_CONCURRENT_EDIT");
  const invalid=/(_INVALID|_UNKNOWN_FIELD)$/.test(code);
  return Response.json({code,error:conflict?"Údaje sa medzitým zmenili. Obnov kontrolované polia.":invalid?
    "Neplatný číselný alebo výberový údaj.":"Kontrolované polia teraz nie sú dostupné."},
    {status:conflict?409:invalid?400:503,headers:{"cache-control":"no-store"}});
}
export async function GET(_request:Request,{params}:Props) {
  const user=await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  const id=await context(params);
  if (!id) return Response.json({error:"Neplatné ID plemena."},{status:400});
  if (!await getManagedBreed(id)) return Response.json({error:"Plemeno sa nenašlo."},{status:404});
  const bindings=env as unknown as Bindings;
  if (!bindings.DB) return Response.json({error:"Databáza nie je dostupná."},{status:503});
  try {
    const state=await getBreedControlledState({database:bindings.DB,bindings,breedId:id});
    return Response.json(state,{headers:{"cache-control":"no-store"}});
  }catch(error){return failed(error);}
}
export async function PUT(request:Request,{params}:Props) {
  const auth=await requireAdminMutation(request,{strictProvenance:true});
  if (auth.response || !auth.user) return auth.response??unauthorizedAdminResponse();
  const id=await context(params);
  if (!id) return Response.json({error:"Neplatné ID plemena."},{status:400});
  if (!await getManagedBreed(id)) return Response.json({error:"Plemeno sa nenašlo."},{status:404});
  const bindings=env as unknown as Bindings;
  if (!bindings.DB) return Response.json({error:"Databáza nie je dostupná."},{status:503});
  try {
    const body=await request.json() as {expectedRevision?:unknown;changes?:unknown};
    if (!body || !Number.isSafeInteger(body.expectedRevision) ||
        !body.changes || typeof body.changes!=="object" || Array.isArray(body.changes))
      return Response.json({error:"Neplatná revízia alebo zmenené polia."},{status:400});
    const state=await saveBreedControlledFromAdmin({
      database:bindings.DB,bindings,breedId:id,
      expectedRevision:body.expectedRevision as number,
      changes:body.changes as Record<string,unknown>,
    });
    return Response.json(state,{headers:{"cache-control":"no-store"}});
  }catch(error){return failed(error);}
}
