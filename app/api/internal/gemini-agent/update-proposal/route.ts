import { env } from "cloudflare:workers";
import { requireGeminiAdminD1 } from "@/lib/gemini-automation-admin-db";
import { submitGeminiDirectoryQualityProposal } from "@/lib/gemini-external-quality-proposals";

export async function POST(request:Request) {
  const headers={ "Cache-Control":"no-store" };
  // Deployment alone must never enable new production D1 proposal writes.
  if((env as unknown as { GEMINI_QUALITY_PROPOSALS_ENABLED?: string }).GEMINI_QUALITY_PROPOSALS_ENABLED !== "true")
    return Response.json({status:"BLOCKED"},{status:503,headers});
  if(!request.headers.get("content-type")?.includes("application/json"))
    return Response.json({status:"BLOCKED"},{status:415,headers});
  try{
    const result=await submitGeminiDirectoryQualityProposal({
      db:requireGeminiAdminD1(),
      env:env as unknown as Parameters<typeof submitGeminiDirectoryQualityProposal>[0]["env"],
      body:await request.text(),signature:request.headers.get("x-psipedia-signature"),
    });
    // No canonical IDs or private fields leave this internal endpoint.
    return Response.json({status:result.status},{status:result.httpStatus,headers});
  }catch{return Response.json({status:"BLOCKED"},{status:503,headers})}
}
