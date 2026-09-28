import { getAdminApiUser, requireAdminMutation, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { getAutomationCanonicalApplyPreview } from "@/lib/data-automation-canonical-apply";

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
  return Response.json(
    {error:"Automation canonical apply je trvalo vypnutý. Identity review nesmie meniť existujúci canonical záznam."},
    {status:410,headers:{"cache-control":"no-store"}},
  );
}
