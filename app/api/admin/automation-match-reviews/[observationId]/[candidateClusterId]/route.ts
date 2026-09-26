import { requireAdminMutation } from "@/lib/admin-auth";
import {
  automationMatchReviewDecisions,
  AutomationMatchReviewConflictError,
  AutomationMatchReviewSemanticError,
  reviewAutomationPossibleMatch,
  type AutomationMatchReviewDecision,
} from "@/lib/data-automation-match-review";

export const dynamic = "force-dynamic";
type Props={params:Promise<{observationId:string;candidateClusterId:string}>};

export async function PUT(request:Request,{params}:Props){
  const auth=await requireAdminMutation(request);
  if(auth.response || !auth.user) return auth.response!;
  const raw=await params;
  const observationId=Number.parseInt(raw.observationId,10);
  const candidateClusterId=Number.parseInt(raw.candidateClusterId,10);
  if(!Number.isSafeInteger(observationId)||observationId<1||!Number.isSafeInteger(candidateClusterId)||candidateClusterId<1)
    return Response.json({error:"Neplatný POSSIBLE match."},{status:400});
  const body=await request.json().catch(()=>null) as {decision?:unknown;note?:unknown;expectedDecisionId?:unknown;expectedEvidenceFingerprint?:unknown}|null;
  if(!body||typeof body.decision!=="string"||!automationMatchReviewDecisions.includes(body.decision as AutomationMatchReviewDecision))
    return Response.json({error:"Neplatné rozhodnutie."},{status:400});
  if(typeof body.expectedEvidenceFingerprint!=="string"||!body.expectedEvidenceFingerprint)
    return Response.json({error:"Chýba evidence fingerprint."},{status:400});
  const expectedDecisionId=body.expectedDecisionId==null?null:Number(body.expectedDecisionId);
  if(expectedDecisionId!==null&&(!Number.isSafeInteger(expectedDecisionId)||expectedDecisionId<1))
    return Response.json({error:"Neplatná verzia rozhodnutia."},{status:400});
  try{
    const review=await reviewAutomationPossibleMatch({
      observationId,candidateClusterId,decision:body.decision as AutomationMatchReviewDecision,
      reviewer:auth.user.email,note:typeof body.note==="string"?body.note:null,
      expectedDecisionId,expectedEvidenceFingerprint:body.expectedEvidenceFingerprint,
    });
    return review?Response.json({review},{headers:{"cache-control":"no-store"}}):Response.json({error:"POSSIBLE match sa nenašiel."},{status:404});
  }catch(error){
    if(error instanceof AutomationMatchReviewConflictError) return Response.json({error:error.message},{status:409});
    if(error instanceof AutomationMatchReviewSemanticError) return Response.json({error:error.message},{status:422});
    return Response.json({error:error instanceof Error?error.message:"Rozhodnutie sa nepodarilo uložiť."},{status:409});
  }
}
