import { env } from "cloudflare:workers";
import { requireAdminMutation } from "@/lib/admin-auth";
import {
  getQualityMissingDatabase, runManualQualitySearch, validManualQualityRequest,
  type ManualQualityInput,
} from "@/lib/data-quality-missing-hourly";

export const dynamic = "force-dynamic";
export async function POST(request:Request) {
  const auth=await requireAdminMutation(request);
  if(auth.response||!auth.user)return auth.response!;
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({error:"Požadovaný je JSON."},{status:415});
  }
  let body:ManualQualityInput;
  try {body=await request.json() as ManualQualityInput;} catch {
    return Response.json({error:"Neplatné JSON."},{status:400});
  }
  if(!body||typeof body!=="object"||Array.isArray(body)) {
    return Response.json({error:"Neplatné zadanie."},{status:400});
  }
  try {
    validManualQualityRequest(body);
  } catch(error) {
    return Response.json({error:error instanceof Error?error.message:"Neplatné zadanie."},{status:400});
  }
  try {
    const bindings=env as unknown as {TAVILY_API_KEY?:string};
    const result=await runManualQualitySearch(
      getQualityMissingDatabase(),body,auth.user.email,bindings.TAVILY_API_KEY,
    );
    return Response.json(result,{headers:{"cache-control":"private, no-store"}});
  } catch(error) {
    // Expose a bounded, credential-free error only; do not emit provider payloads.
    const message=error instanceof Error?error.message:"Vyhľadávanie zlyhalo.";
    return Response.json({error:message.slice(0,300)},{status:422,headers:{"cache-control":"private, no-store"}});
  }
}
