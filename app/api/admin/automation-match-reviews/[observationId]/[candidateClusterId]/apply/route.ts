import { getAdminApiUser, requireAdminMutation, unauthorizedAdminResponse } from "@/lib/admin-auth";
import {
  applyAutomationCanonicalReview,
  canonicalFieldApplyActions,
  CanonicalApplyBlockedError,
  CanonicalApplyConflictError,
  CanonicalApplyUnsupportedError,
  getAutomationCanonicalApplyPreview,
  type CanonicalFieldApplyAction,
} from "@/lib/data-automation-canonical-apply";

export const dynamic="force-dynamic";
type Props={params:Promise<{observationId:string;candidateClusterId:string}>};

function ids(raw:{observationId:string;candidateClusterId:string}){
  const observationId=Number.parseInt(raw.observationId,10);
  const candidateClusterId=Number.parseInt(raw.candidateClusterId,10);
  return Number.isSafeInteger(observationId)&&observationId>0&&Number.isSafeInteger(candidateClusterId)&&candidateClusterId>0
    ? {observationId,candidateClusterId}:null;
}

export async function GET(_request:Request,{params}:Props){
  const user=await getAdminApiUser();
  if(!user) return unauthorizedAdminResponse();
  const parsed=ids(await params);
  if(!parsed) return Response.json({error:"Neplatný POSSIBLE match."},{status:400});
  const preview=await getAutomationCanonicalApplyPreview(parsed);
  return preview?Response.json({preview},{headers:{"cache-control":"no-store"}}):Response.json({error:"POSSIBLE match sa nenašiel."},{status:404});
}

export async function POST(request:Request,{params}:Props){
  const auth=await requireAdminMutation(request);
  if(auth.response||!auth.user) return auth.response!;
  const parsed=ids(await params);
  if(!parsed) return Response.json({error:"Neplatný POSSIBLE match."},{status:400});
  const body=await request.json().catch(()=>null) as null|{
    expectedDecisionId?:unknown;expectedDecisionVersion?:unknown;expectedEvidenceFingerprint?:unknown;
    expectedCanonicalUpdatedAt?:unknown;
    selections?:Array<{fieldName?:unknown;action?:unknown;evidenceId?:unknown;confirmConflict?:unknown}>;
  };
  if(!body||!Number.isSafeInteger(Number(body.expectedDecisionId))||Number(body.expectedDecisionId)<1
    ||!Number.isSafeInteger(Number(body.expectedDecisionVersion))||Number(body.expectedDecisionVersion)<1
    ||typeof body.expectedEvidenceFingerprint!=="string"||!body.expectedEvidenceFingerprint
    ||typeof body.expectedCanonicalUpdatedAt!=="string"||!body.expectedCanonicalUpdatedAt
    ||!Array.isArray(body.selections)){
    return Response.json({error:"Chýba alebo je neplatný apply precondition contract."},{status:400});
  }
  const selections=[];
  for(const item of body.selections){
    if(!item||typeof item.fieldName!=="string"||typeof item.action!=="string"
      ||!canonicalFieldApplyActions.includes(item.action as CanonicalFieldApplyAction)){
      return Response.json({error:"Neplatný field-level apply výber."},{status:400});
    }
    const evidenceId=item.evidenceId==null?null:Number(item.evidenceId);
    if(evidenceId!==null&&(!Number.isSafeInteger(evidenceId)||evidenceId<1)){
      return Response.json({error:"Neplatné evidence ID."},{status:400});
    }
    selections.push({fieldName:item.fieldName,action:item.action as CanonicalFieldApplyAction,evidenceId,confirmConflict:item.confirmConflict===true});
  }
  try{
    const result=await applyAutomationCanonicalReview({
      ...parsed,reviewerEmail:auth.user.email,
      expectedDecisionId:Number(body.expectedDecisionId),expectedDecisionVersion:Number(body.expectedDecisionVersion),
      expectedEvidenceFingerprint:body.expectedEvidenceFingerprint,expectedCanonicalUpdatedAt:body.expectedCanonicalUpdatedAt,
      selections,
    });
    return Response.json({result},{headers:{"cache-control":"no-store"}});
  }catch(error){
    if(error instanceof CanonicalApplyConflictError) return Response.json({error:error.message},{status:409});
    if(error instanceof CanonicalApplyBlockedError) return Response.json({error:error.message},{status:422});
    if(error instanceof CanonicalApplyUnsupportedError) return Response.json({error:error.message},{status:400});
    return Response.json({error:error instanceof Error?error.message:"Canonical apply sa nepodaril."},{status:409});
  }
}
